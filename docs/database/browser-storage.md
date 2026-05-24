# Browser Storage

Browser persistence uses `localforage` with the PromptCard database name.

The frontend treats browser storage as the primary persistence layer. Development JSON file persistence is opportunistic and should not be required for production builds.
