.PHONY: help dev build test lint release release-patch release-minor release-major release-alpha tauri tauri-dev android icons

# Default target
help:
	@echo "Seal - Available commands:"
	@echo ""
	@echo "  Development:"
	@echo "    make dev          - Start development server"
	@echo "    make build        - Build web app"
	@echo "    make test         - Run tests"
	@echo "    make lint         - Run linter"
	@echo ""
	@echo "  Desktop (Tauri):"
	@echo "    make tauri-dev    - Start Tauri development"
	@echo "    make tauri        - Build Tauri desktop app"
	@echo ""
	@echo "  Mobile:"
	@echo "    make android      - Build Android APK"
	@echo ""
	@echo "  Release:"
	@echo "    make release       - Bump patch version, commit, tag, and push"
	@echo "    make release-patch - Same as 'make release'"
	@echo "    make release-minor - Bump minor version and release"
	@echo "    make release-major - Bump major version and release"
	@echo "    make release-alpha - Bump alpha version and release"
	@echo ""
	@echo "  Utilities:"
	@echo "    make icons        - Generate app icons"

# Development
dev:
	npm run dev

build:
	npm run build

test:
	npm run test:run

lint:
	npm run lint

# Desktop (Tauri)
tauri-dev:
	npm run tauri:dev

tauri:
	npm run tauri:build

# Mobile
android:
	cd android && ./gradlew assembleRelease

# Release - bump version, commit, tag, push
release: release-patch

release-patch:
	@npm run version -- patch
	@git add -A
	@git commit -m "bump: v$$(node -p "require('./package.json').version")"
	@git tag -a "v$$(node -p "require('./package.json').version")" -m "Release v$$(node -p "require('./package.json').version")"
	@git push && git push --tags
	@echo "\n✅ Released v$$(node -p "require('./package.json').version")"

release-minor:
	@npm run version -- minor
	@git add -A
	@git commit -m "bump: v$$(node -p "require('./package.json').version")"
	@git tag -a "v$$(node -p "require('./package.json').version")" -m "Release v$$(node -p "require('./package.json').version")"
	@git push && git push --tags
	@echo "\n✅ Released v$$(node -p "require('./package.json').version")"

release-major:
	@npm run version -- major
	@git add -A
	@git commit -m "bump: v$$(node -p "require('./package.json').version")"
	@git tag -a "v$$(node -p "require('./package.json').version")" -m "Release v$$(node -p "require('./package.json').version")"
	@git push && git push --tags
	@echo "\n✅ Released v$$(node -p "require('./package.json').version")"

release-alpha:
	@npm run version -- alpha
	@git add -A
	@git commit -m "bump: v$$(node -p "require('./package.json').version")"
	@git tag -a "v$$(node -p "require('./package.json').version")" -m "Release v$$(node -p "require('./package.json').version")"
	@git push && git push --tags
	@echo "\n✅ Released v$$(node -p "require('./package.json').version")"

# Utilities
icons:
	npm run icons