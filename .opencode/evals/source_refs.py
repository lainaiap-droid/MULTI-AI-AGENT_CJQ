"""Разрешение ссылок на источники требований.

Датасет хранится в git, поэтому реальные идентификаторы страниц
Confluence в него не попадают. Вместо них кейс содержит логическую
ссылку вида page_ref = "SOURCE_PAGE_ID".

Фактическое значение берётся из окружения:
1. переменная окружения с именем ссылки, например SOURCE_PAGE_ID;
2. .opencode/local.jsonc или .opencode/local.json в виде
   {"sources": {"SOURCE_PAGE_ID": "<id>"}}.

Оба источника не попадают в git: .env-файлы и .opencode/local.jsonc
перечислены в .gitignore.
"""

import json
import os
from pathlib import Path


LOCAL_CONFIG_NAMES = (
    "local.jsonc",
    "local.json",
)


class SourceRefError(RuntimeError):

    # Ссылка не разрешена: без фактического идентификатора прогон
    # невозможен, подставлять значение по умолчанию нельзя.
    pass


def _strip_jsonc_comments(text):

    # local.jsonc позволяет комментарии. Строки в кавычках при этом
    # не трогаем, чтобы не испортить значения.

    result = []
    in_string = False
    escaped = False
    index = 0

    while index < len(text):

        char = text[index]

        if in_string:

            result.append(char)

            if escaped:

                escaped = False

            elif char == "\\":

                escaped = True

            elif char == '"':

                in_string = False

            index += 1

            continue

        if char == '"':

            in_string = True
            result.append(char)
            index += 1

            continue

        # // комментарий до конца строки
        if char == "/" and index + 1 < len(text) and text[index + 1] == "/":

            while index < len(text) and text[index] not in "\r\n":

                index += 1

            continue

        # /* блочный комментарий */
        if char == "/" and index + 1 < len(text) and text[index + 1] == "*":

            index += 2

            while index + 1 < len(text) and not (
                text[index] == "*" and text[index + 1] == "/"
            ):

                index += 1

            index += 2

            continue

        result.append(char)
        index += 1

    return "".join(result)


def load_local_sources(project_path):

    # Читает локальный конфиг, если он есть. Отсутствие файла —
    # нормальная ситуация: тогда работают только переменные окружения.

    for name in LOCAL_CONFIG_NAMES:

        config_path = Path(project_path) / ".opencode" / name

        if not config_path.is_file():

            continue

        raw = config_path.read_text(
            encoding="utf-8",
            errors="replace"
        )

        try:

            data = json.loads(
                _strip_jsonc_comments(raw)
            )

        except json.JSONDecodeError as error:

            raise SourceRefError(
                f"{config_path} содержит некорректный JSON: {error}"
            ) from error

        sources = data.get("sources")

        if isinstance(sources, dict):

            return sources

        return {}

    return {}


def resolve_source_ref(page_ref, project_path, environ=None):

    # Возвращает фактический идентификатор страницы по ссылке из датасета.

    if not page_ref:

        raise SourceRefError(
            "В Eval Case не задана ссылка на источник (page_ref)."
        )

    environment = os.environ if environ is None else environ

    # Целое число допустимо: локальная копия датасета может хранить
    # идентификатор напрямую, в git он при этом не попадает.

    if isinstance(page_ref, int):

        return str(page_ref)

    # Ссылка-число в виде строки тоже принимается.

    if str(page_ref).isdigit():

        return str(page_ref)

    value = environment.get(page_ref)

    if value:

        return str(value)

    local_sources = load_local_sources(project_path)

    value = local_sources.get(page_ref)

    if value:

        return str(value)

    raise SourceRefError(
        f"Ссылка {page_ref} не разрешена. Задайте переменную "
        f"окружения {page_ref} или запись sources.{page_ref} "
        f"в .opencode/local.jsonc."
    )


def resolve_case_page_id(eval_case, project_path, environ=None):

    # Единая точка входа для кейса: понимает и новую ссылку
    # page_ref, и старый целочисленный page_id.

    eval_input = eval_case.get("input", {})

    if eval_input.get("page_ref"):

        return resolve_source_ref(
            eval_input["page_ref"],
            project_path,
            environ
        )

    page_id = eval_input.get("page_id")

    if page_id is None:

        raise SourceRefError(
            f"Eval Case {eval_case.get('id')} не содержит ни "
            f"page_ref, ни page_id."
        )

    return str(page_id)
