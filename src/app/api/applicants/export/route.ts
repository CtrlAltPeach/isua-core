// GET /api/applicants/export — выгрузка ВСЕХ абитуриентов в XLSX (12C → итер. 14, C).
// Лист «Абитуриенты» (данные) + лист «Статистика» (со встроенными формулами Excel,
// чтобы пересчёт шёл в самом файле). ПДн (паспорт/ИНН/СНИЛС) — только для админа,
// расшифрованными; оператор получает файл без колонок ПДн. Фильтры НЕ применяются
// (всегда весь список).
import type { NextRequest } from "next/server";
import ExcelJS from "exceljs";
import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { unauthorized } from "@/lib/http";
import { decryptPiiList } from "@/lib/applicant-pii";
import { STATUS_FULL_LABEL } from "@/lib/applicant-ui";
import type { ApplicantStatus } from "@/lib/types";

function docTypeLabel(t: string | null): string {
  return t === "diploma" ? "Диплом" : t === "certificate" ? "Аттестат" : "";
}
function yesNo(v: boolean): string {
  return v ? "Да" : "Нет";
}

export async function GET(req: NextRequest) {
  const user = await getCurrentUser(req);
  if (!user) return unauthorized();
  const isAdmin = user.role === "admin";

  const [rows, programs] = await Promise.all([
    prisma.applicant.findMany({
      orderBy: [{ programId: "asc" }, { totalScore: "desc" }],
      include: { program: { select: { name: true } } },
    }),
    prisma.program.findMany({
      select: { name: true, places: true },
      orderBy: { id: "asc" },
    }),
  ]);
  // ПДн расшифровываем только для админа.
  const items = isAdmin ? decryptPiiList(rows) : rows;

  const wb = new ExcelJS.Workbook();
  wb.creator = "ИСУА";
  wb.created = new Date();

  // --- Лист «Абитуриенты» ---
  const ws = wb.addWorksheet("Абитуриенты");

  // Колонки. ПДн — только для админа.
  const columns: Partial<ExcelJS.Column>[] = [
    { header: "№", key: "n", width: 5 },
    { header: "ФИО", key: "fullName", width: 28 },
    { header: "Программа", key: "program", width: 14 },
    { header: "Статус", key: "status", width: 18 },
    { header: "Балл", key: "totalScore", width: 8 },
    { header: "Согласие", key: "consent", width: 10 },
    { header: "Документы", key: "docs", width: 11 },
    { header: "Особая квота", key: "specialQuota", width: 13 },
    { header: "Особое право", key: "specialRight", width: 13 },
    { header: "Платное", key: "isPaid", width: 9 },
    { header: "Телефон", key: "phone", width: 16 },
    { header: "Email", key: "email", width: 22 },
    { header: "Гражданство", key: "citizenship", width: 14 },
    { header: "Документ", key: "docType", width: 11 },
  ];
  if (isAdmin) {
    columns.push(
      { header: "Паспорт серия", key: "passportSeries", width: 14 },
      { header: "Паспорт номер", key: "passportNumber", width: 14 },
      { header: "СНИЛС", key: "snils", width: 16 },
      { header: "ИНН", key: "inn", width: 14 },
      { header: "Прописка", key: "registrationAddress", width: 30 },
    );
  }
  ws.columns = columns;

  items.forEach((a, i) => {
    const row: Record<string, unknown> = {
      n: i + 1,
      fullName: a.fullName,
      program: a.program?.name ?? "",
      status: STATUS_FULL_LABEL[a.status as ApplicantStatus] ?? a.status,
      totalScore: a.totalScore ?? "",
      consent: yesNo(a.consentToEnroll),
      docs: yesNo(a.documentsComplete),
      specialQuota: yesNo(a.specialQuota),
      specialRight: yesNo(a.specialRight),
      isPaid: yesNo(a.isPaid),
      phone: a.phone ?? "",
      email: a.email ?? "",
      citizenship: a.citizenship ?? "",
      docType: docTypeLabel(a.documentType),
    };
    if (isAdmin) {
      row.passportSeries = a.passportSeries ?? "";
      row.passportNumber = a.passportNumber ?? "";
      row.snils = a.snils ?? "";
      row.inn = a.inn ?? "";
      row.registrationAddress = a.registrationAddress ?? "";
    }
    ws.addRow(row);
  });

  // Шапка — жирная, с заливкой.
  ws.getRow(1).font = { bold: true };
  ws.getRow(1).fill = {
    type: "pattern",
    pattern: "solid",
    fgColor: { argb: "FFD1FAE5" }, // emerald-100
  };
  ws.views = [{ state: "frozen", ySplit: 1 }];

  // --- Лист «Статистика» (формулы ссылаются на лист «Абитуриенты») ---
  const n = items.length;
  const dataLast = n + 1; // строка последних данных (шапка = 1)
  const D = "Абитуриенты"; // имя листа для ссылок
  const st = wb.addWorksheet("Статистика");
  st.columns = [
    { header: "Показатель", key: "k", width: 32 },
    { header: "Значение", key: "v", width: 16 },
  ];
  st.getRow(1).font = { bold: true };

  // Диапазоны колонок листа данных (1-based индексы → буквы).
  const colStatus = "D"; // Статус
  const colScore = "E"; // Балл
  const colConsent = "F"; // Согласие (Да/Нет)
  const colDocs = "G"; // Документы

  const addStat = (label: string, formula: string) => {
    const r = st.addRow({ k: label });
    r.getCell(2).value = { formula } as ExcelJS.CellFormulaValue;
  };

  st.addRow({ k: "По статусам" }).font = { bold: true };
  addStat("Всего абитуриентов", `${n}`);
  addStat(
    "Подали заявление",
    `COUNTIF('${D}'!${colStatus}2:${colStatus}${dataLast},"Подал заявление")`,
  );
  addStat(
    "Забрали заявление",
    `COUNTIF('${D}'!${colStatus}2:${colStatus}${dataLast},"Забрал заявление")`,
  );

  st.addRow({});
  st.addRow({ k: "Баллы" }).font = { bold: true };
  const scoreRange = `'${D}'!${colScore}2:${colScore}${dataLast}`;
  addStat("Средний балл", `IFERROR(ROUND(AVERAGE(${scoreRange}),1),0)`);
  addStat("Минимальный балл", `IFERROR(MIN(${scoreRange}),0)`);
  addStat("Максимальный балл", `IFERROR(MAX(${scoreRange}),0)`);

  st.addRow({});
  st.addRow({ k: "Согласия / документы" }).font = { bold: true };
  addStat(
    "% согласий",
    `IF(${n}=0,0,ROUND(COUNTIF('${D}'!${colConsent}2:${colConsent}${dataLast},"Да")/${n}*100,1))`,
  );
  addStat(
    "% собранных документов",
    `IF(${n}=0,0,ROUND(COUNTIF('${D}'!${colDocs}2:${colDocs}${dataLast},"Да")/${n}*100,1))`,
  );

  // --- Разбивка по программам (на листе «Статистика») ---
  st.addRow({});
  const hdr = st.addRow({ k: "Программа", v: "Абитуриентов" });
  hdr.font = { bold: true };
  st.getCell(`C${hdr.number}`).value = "Мест";
  st.getCell(`D${hdr.number}`).value = "Конкурс";
  st.getCell(`E${hdr.number}`).value = "Ср. балл";
  const colProgram = "C"; // Программа на листе данных
  for (const p of programs) {
    const r = st.addRow({ k: p.name });
    const cntRef = `COUNTIF('${D}'!${colProgram}2:${colProgram}${dataLast},"${p.name}")`;
    r.getCell(2).value = { formula: cntRef } as ExcelJS.CellFormulaValue;
    r.getCell(3).value = p.places;
    // Конкурс = абитуриентов / мест.
    r.getCell(4).value = {
      formula: `IF(C${r.number}=0,0,ROUND(B${r.number}/C${r.number},2))`,
    } as ExcelJS.CellFormulaValue;
    // Ср. балл по программе (AVERAGEIF).
    r.getCell(5).value = {
      formula: `IFERROR(ROUND(AVERAGEIF('${D}'!${colProgram}2:${colProgram}${dataLast},"${p.name}",'${D}'!${colScore}2:${colScore}${dataLast}),1),0)`,
    } as ExcelJS.CellFormulaValue;
  }

  const buffer = await wb.xlsx.writeBuffer();
  const date = new Date().toISOString().slice(0, 10);
  const filename = `applicants_${date}.xlsx`;

  return new Response(buffer, {
    status: 200,
    headers: {
      "Content-Type":
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Cache-Control": "no-store",
    },
  });
}
