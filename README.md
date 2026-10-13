# Knowledge Base

A static site (GitHub Pages) for team articles: **search, view, add, edit and delete**. In the editor you can **paste pictures (Ctrl+V)**, such as screenshots and copied images. You can also drag them in or use 🖼 Image.

Articles are stored in Supabase (table `kb_articles`). Pictures are compressed in the browser (max 1600 px wide, WebP/JPEG) and saved inside the article, so no separate file storage is needed.

## Setup (once)

1. **Database:** in Supabase, open **SQL Editor → New query**, paste [`setup.sql`](setup.sql) and click **Run**.
2. **Connect the site:** edit [`js/config.js`](js/config.js) on GitHub (✏️ → Commit) and fill in:
   - `supabaseUrl`: Project Settings → Data API → Project URL
   - `supabaseAnonKey`: Project Settings → API Keys → Legacy → **anon public**

   Only change the text between the quotes, and keep the `name: 'value',` format.

   Use the anon key only. **Never** use the `service_role` key, because this file is public.
3. **Turn on GitHub Pages:** go to **Settings → Pages → Deploy from a branch → `main` / `(root)`**. The site is then at `https://kailknight.github.io/knowledgebase/`.

## Using it

- **Search** covers titles, tags, categories and article text. Click a category chip to filter.
- **+ New article:** title, category (it suggests existing ones), tags (comma separated) and the content.
- **Toolbar:** bold, italic, underline, heading, sub-heading, bulleted and numbered lists, quote, code block, link, image and clear formatting. Text pasted from Word or Outlook keeps headings, lists and tables but drops its styling.
- **Sign in** with your **OnePopHealth username**. Users and roles are managed in OnePopHealth → Admin Dashboard → Users:
  - **Admin**, **Approver** and **User** can add and edit articles.
  - Only **Admin** can delete.
  - **View** is read-only.
- **Editing safety:**
  - If someone else saved the same article while you were editing, you're asked before it's overwritten.
  - Leaving the editor with unsaved changes asks first.
- Click a picture in an article to see it full size.

## Notes

- The login is username-only (like OnePopHealth), so roles are honour-system. Don't put passwords or other secrets in articles.
- All content is cleaned with DOMPurify before it's saved and shown.
