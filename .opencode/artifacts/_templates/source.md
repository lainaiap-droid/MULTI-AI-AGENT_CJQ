---
artifact: source
version: 1
run_id: RUN-YYYYMMDD-HHMMSS
status: READY
source_type: confluence
source_status: approved
page_id: "<page-id>"
page_version: 1
title: "<page-title>"
url: "<url>"
retrieved_at: "<ISO-8601>"
---

# Source

## Metadata

| Поле | Значение |
|---|---|
| Page ID | `<page-id>` |
| Title | `<page-title>` |
| Page version | `<page_version>` |
| Page status | `approved / final / draft / in_review` |
| URL | `<url>` |
| Retrieved at | `<ISO-8601>` |
| Space | `<space>` |
| Parent page | `<parent-id или null>` |

## Requirements Text

<Нормализованный текст требований без потери значимых условий.>

## Related Sources

| SRC ID | Page ID | Title | Version | Status | URL |
|---|---|---|---|---|---|
| `SRC-001` | `<page-id>` | `<title>` | `<version>` | `<status>` | `<url>` |

## Comments with Decisions

| Дата | Автор | Решение или уточнение |
|---|---|---|
| `<date>` | `<author>` | `<text>` |

## Unconfirmed Fragments

| Фрагмент | Причина | Что нужно подтвердить |
|---|---|---|
| `<text>` | `draft / in_review / нет подтверждения` | `<owner>` |
