# Changelog

All notable changes to this project are documented in this file.

## [0.2.0] - 2026-07-30

### 🚀 Features

- [**breaking**] Rename the schema option to pgSchema and add tablesPrefix (#9)
- Implement createSchema for `@better-auth/cli generate` (#8)

### 🐛 Bug Fixes

- Align createSchema with better-auth on unique indexed fields (#10)

### 🧪 Testing

- Split the suite into postgres and sqlite folders (#11)
- Run the suite against real Postgres in Docker (#7)

## [0.1.1] - 2026-06-16

### 📚 Documentation

- Update readme (#5)

## [0.1.0] - 2026-06-16

Initial release, with support for PostgreSQL and SQLite.
