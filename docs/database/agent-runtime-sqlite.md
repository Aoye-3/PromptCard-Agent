# Agent Runtime SQLite

The Agent Runtime config uses SQLite:

```yaml
database:
  backend: sqlite
  sqlite_dir: .deer-flow/data
```

Runtime database files are local generated state. Do not commit runtime databases or cache directories.
