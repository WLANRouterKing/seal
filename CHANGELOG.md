# Changelog

Alle wichtigen Änderungen an diesem Projekt werden hier dokumentiert.

## [Unreleased]

### Bug Fixes

- Overwrite release via gitlab api if it exists
- Pipeline conf for changelogs
- Cliff config adjustments
- Refactor translations

### Features

- Use foreground service for push notifications
- Use foreground service for push notifications
- Containerize pwa with capacitor to have native api capabilities
- Add Changelog.md
- Feat encrypted file upload to nostr.build
feat automatic changelog
- Feat encrypted file upload to nostr.build
feat automatic changelog

### Änderungen

- Remove capacitor.config.ts and use foreground service without google play services for push notifications
- Use node 22 in pipeline
- Use node 22 in pipeline
- Remove wrong changelog file
- Merge remote-tracking branch 'origin/master'
- Fix exclude coverage folder from git
- Merge remote-tracking branch 'origin/master'
- License
- Misc
- File upload changes + validate sender public key
- File upload changes + validate sender public key
- File upload changes + validate sender public key

## [0.1.1-alpha] - 2025-12-19

### Änderungen

- Fix readme nip 17 link
- Fix notification bugs
- Add screenshots + dont show errors in console if db is locked
- Add Contact via QR
- Add Contact via QR
- Merge branch 'set-sast-iac-config-1' into 'master'

Configure SAST IaC in `.gitlab-ci.yml`, creating this file if it does not already exist

See merge request open-source/seal!3
- Configure SAST IaC in `.gitlab-ci.yml`, creating this file if it does not already exist
- Sync + qr pkey export + qr code scanner + styling changes

## [0.1.0-alpha] - 2025-12-19

### Änderungen

- Encrypt all sensitive values in db. cleanup deleted_messages table after 90 days
- Styling anpassung + webp wenn browser es unterstützt
- Relay-rotation muss mehrere funktionsfähige relays bereitstellen mit fallback
- Fix deploy path
- Fix deploy path
- Fix deploy path
- Fix deploy path
- Fix deploy path
- Fix db service error
- No conf templates
- Initial commit

---
*Automatisch generiert mit [git-cliff](https://git-cliff.org)*
