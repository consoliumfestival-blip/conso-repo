# Repository boundary

- This repository, `https://github.com/consoliumfestival-blip/conso-repo.git`, is the editable target. Verify its `origin` and current branch before committing or pushing.
- `https://github.com/shibilikds133-spec/sahi-m-fest.git` is a read-only source reference. Inspect and compare it when useful, but never edit its checkout or push to it.
- The source Supabase project is read-only. Database changes, when explicitly in scope, belong only to the verified target Supabase project. Check project identity, migration history, tenant boundaries, and existing data before applying them.
- Source and target have independent Git histories and may differ. Port only reviewed changes needed for the requested behavior; do not overwrite target-specific work or assume a source commit is already deployed here.
- Preserve existing data, APIs, permissions, and working flows. Validate the relevant code and migration dependencies before pushing the target `main` branch.
