# Settings fields by element type

Settings offers `cite` for Blockquote; `start`, `reversed` and `type` for Ordered list; Caption text and `scope` for table headings; `accept` and `multiple` for File input; `cols`, maximum length and minimum length for Textarea; `low`, `high` and `optimum` for Meter; `title`, `allow` and `loading` for Embedded frame; and `playsinline` and `preload` for Video. A field appears only where its HTML attribute applies. Each edit uses the existing attribute command, one undo step, survives reload and exports with its HTML name.

The page body's `title` field is labelled Tooltip, so it cannot be mistaken for the separate Page title written into `<title>`. An Embedded frame without a title produces an Accessibility issue in Checks; entering its Title removes that issue and exports `<iframe title="…">`.
