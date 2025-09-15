# Release 构建脚本 (PowerShell)
param(
    [string]$Target = "x86_64-pc-windows-msvc",
    [string]$OutputDir = "./artifacts/release",
    [string]$Version = ""
)

Write-Host "🏭 Starting Release Build for Serial Pilot" -ForegroundColor Green
Write-Host "Target: $Target" -ForegroundColor Yellow
Write-Host "Output Directory: $OutputDir" -ForegroundColor Yellow
if ($Version) {
    Write-Host "Version: $Version" -ForegroundColor Yellow
}

# 设置环境变量
$env:VITE_APP_ENV = "production"
$env:VITE_DEBUG = "false"
$env:VITE_LOG_LEVEL = "warn"
$env:VITE_ENABLE_CONSOLE = "false"
$env:VITE_SHOW_DEV_TOOLS = "false"
$env:VITE_ENABLE_DETAILED_LOGS = "false"
$env:VITE_LOG_SERIAL_EVENTS = "false"
$env:VITE_ENABLE_TEST_FEATURES = "false"
$env:VITE_ENABLE_MOCK_DATA = "false"

# 创建输出目录
New-Item -ItemType Directory -Force -Path $OutputDir | Out-Null

# 获取版本信息
if (-not $Version) {
    $Version = (Get-Content "package.json" | ConvertFrom-Json).version
    if (Test-Path ".git") {
        $gitCommit = git rev-parse --short HEAD
        $Version = "$Version+$gitCommit"
    }
}

# 更新版本号
Write-Host "🔢 Setting version: $Version" -ForegroundColor Cyan
npm version $Version --no-git-tag-version

# 构建前端 (Release 模式)
Write-Host "📦 Building Frontend (Release Mode)..." -ForegroundColor Cyan
npm run build
if ($LASTEXITCODE -ne 0) {
    Write-Error "Frontend build failed"
    exit 1
}

# 构建 Tauri (Release 模式)
Write-Host "🔨 Building Tauri (Release Mode)..." -ForegroundColor Cyan
npm run tauri:build
if ($LASTEXITCODE -ne 0) {
    Write-Error "Tauri build failed"
    exit 1
}

# 复制构建产物
Write-Host "📋 Copying build artifacts..." -ForegroundColor Cyan

# MSI 安装包
if (Test-Path "src-tauri/target/release/bundle/msi/*.msi") {
    $msiFiles = Get-ChildItem "src-tauri/target/release/bundle/msi/*.msi"
    foreach ($file in $msiFiles) {
        $newName = $file.Name -replace "_.*?_(\d+).*", "_${Version}_`$1"
        Copy-Item $file.FullName -Destination "$OutputDir/$newName" -Force
    }
    Write-Host "✅ MSI installer copied" -ForegroundColor Green
}

# 便携版本（绿色版）
if (Test-Path "src-tauri/target/release/serial-pilot.exe") {
    Copy-Item "src-tauri/target/release/serial-pilot.exe" -Destination "$OutputDir/serial-pilot-v$Version.exe" -Force
    Write-Host "✅ Portable release executable copied (Green Version)" -ForegroundColor Green
}

# NSIS 安装器
if (Test-Path "src-tauri/target/release/bundle/nsis/*.exe") {
    $nsisFiles = Get-ChildItem "src-tauri/target/release/bundle/nsis/*.exe"
    foreach ($file in $nsisFiles) {
        $newName = "serial-pilot-installer-v$Version.exe"
        Copy-Item $file.FullName -Destination "$OutputDir/$newName" -Force
    }
    Write-Host "✅ NSIS installer copied" -ForegroundColor Green
}

# 生成版本信息
Write-Host "📝 Generating version info..." -ForegroundColor Cyan
$versionInfo = @"
Serial Pilot Release Build
============================
Version: $Version
Build Date: $(Get-Date -Format "yyyy-MM-dd HH:mm:ss")
Git Commit: $(git rev-parse --short HEAD)
Git Branch: $(git rev-parse --abbrev-ref HEAD)
Target: $Target
Build Mode: Release

Features:
- Optimized for production
- Console output disabled
- Detailed logging disabled
- Test features disabled
- Minimal dependencies

Installation Options:
1. MSI Installer: Standard Windows installer with uninstall support
2. Portable/Green Version: No installation required, just run serial-pilot-v$Version.exe
3. NSIS Installer: Alternative installer with advanced options

Green Version Benefits:
- No installation required
- No registry entries
- No system modifications
- Can run from USB drive
- Easy to remove

Silent Installation:
msiexec /i serial-pilot-v$Version.msi /quiet

For issues and support:
- Documentation: https://github.com/$(git remote get-url origin | ForEach-Object { $_ -replace '.*github.com[:/](.*)\.git', '$1' })/wiki
- Issues: https://github.com/$(git remote get-url origin | ForEach-Object { $_ -replace '.*github.com[:/](.*)\.git', '$1' })/issues
"@

$versionInfo | Out-File -FilePath "$OutputDir/README_RELEASE.txt" -Encoding UTF8

# 生成校验和
Write-Host "🔐 Generating checksums..." -ForegroundColor Cyan
$checksums = @()
Get-ChildItem $OutputDir -Exclude "*.txt" | ForEach-Object {
    $hash = Get-FileHash $_.FullName -Algorithm SHA256
    $checksums += "$($hash.Hash)  $($_.Name)"
}

$checksums -join "`n" | Out-File -FilePath "$OutputDir/checksums.txt" -Encoding UTF8

Write-Host "🎉 Release build completed successfully!" -ForegroundColor Green
Write-Host "📁 Artifacts available in: $OutputDir" -ForegroundColor Yellow
Write-Host "🔑 Checksums saved to: checksums.txt" -ForegroundColor Yellow

# 列出构建产物
Write-Host "📋 Build artifacts:" -ForegroundColor Cyan
Get-ChildItem $OutputDir | ForEach-Object {
    if ($_.Name -ne "README_RELEASE.txt" -and $_.Name -ne "checksums.txt") {
        Write-Host "  - $($_.Name) ($([math]::Round($_.Length / 1MB, 2)) MB)" -ForegroundColor White
    }
}

Write-Host ""
Write-Host "🚀 Ready for distribution!" -ForegroundColor Green
Write-Host "   - MSI installer for standard installation" -ForegroundColor White
Write-Host "   - Portable EXE for green/no-install version" -ForegroundColor White
Write-Host "   - Checksums provided for verification" -ForegroundColor White