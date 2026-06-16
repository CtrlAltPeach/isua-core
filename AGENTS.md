<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

# Рабочие правила ИСУА

Эти правила обязательны для всех сессий в этом проекте.

## Коммиты
- Коммит **только в конце итерации** или после **значимого объёма работы** (завершённая фича/подзадача, а не промежуточное состояние).
- Не коммитить ради «сохранить прогресс» — незавершённую работу оставляем в рабочем дереве.

## После завершения итерации (обязательно)
1. Обновить `PROMPT/CONTEXT.md` — текущее состояние, версию, стек, что сделано.
2. Обновить `PROMPT/REQUIREMENTS_BACKLOG.md` — отметить сделанное ✅, новые находки внести в реестр, обновить tracking-таблицу (раздел 11).
3. Обновить `PROMPT/NEXT_ITERATION.md` — описать план следующей итерации, собрать в неё идеи из бэклога.
4. Только после этого — финальный коммит итерации.

## Имена файлов
- **Все markdown-файлы всегда называются ЗАГЛАВНЫМИ буквами** (например, `CONTEXT.md`, `NEXT_ITERATION.md`, `REQUIREMENTS_BACKLOG.md`). Это правило и для существующих, и для новых md-файлов.
