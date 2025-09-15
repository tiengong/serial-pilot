# Debug 构建脚本 (PowerShell)
param(
    [string]$Target = "x86_64-pc-windows-msvc",
    [string]$OutputDir = "./artifacts/debug"
)

Write-Host "🔨 Starting Debug Build for Serial Pilot" -ForegroundColor Green
Write-Host "Target: $Target" -ForegroundColor Yellow
Write-Host "Output Directory: $OutputDir" -ForegroundColor Yellow

# 设置环境变量
$env:VITE_APP_ENV = "debug"
$env:VITE_DEBUG = "true"
$env:VITE_LOG_LEVEL = "debug"
$env:VITE_ENABLE_CONSOLE = "true"
$env:VITE_SHOW_DEV_TOOLS = "true"
$env:VITE_ENABLE_DETAILED_LOGS = "true"
$env:VITE_LOG_SERIAL_EVENTS = "true"
$env:VITE_ENABLE_TEST_FEATURES = "true"
$env:VITE_ENABLE_MOCK_DATA = "true"

# 创建输出目录
New-Item -ItemType Directory -Force -Path $OutputDir | Out-Null

# 构建前端 (Debug 模式)
Write-Host "📦 Building Frontend (Debug Mode)..." -ForegroundColor Cyan
npm run build:dev
if ($LASTEXITCODE -ne 0) {
    Write-Error "Frontend build failed"
    exit 1
}

# 构建 Tauri (Debug 模式)
Write-Host "🔨 Building Tauri (Debug Mode)..." -ForegroundColor Cyan
npm run tauri:build:debug
if ($LASTEXITCODE -ne 0) {
    Write-Error "Tauri build failed"
    exit 1
}

# 复制构建产物
Write-Host "📋 Copying build artifacts..." -ForegroundColor Cyan

# MSI 安装包
if (Test-Path "src-tauri/target/debug/bundle/msi/*.msi") {
    Copy-Item "src-tauri/target/debug/bundle/msi/*.msi" -Destination $OutputDir -Force
    Write-Host "✅ MSI installer copied" -ForegroundColor Green
}

# 便携版本
if (Test-Path "src-tauri/target/debug/serial-pilot.exe") {
    Copy-Item "src-tauri/target/debug/serial-pilot.exe" -Destination "$OutputDir/serial-pilot-debug.exe" -Force
    Write-Host "✅ Portable debug executable copied" -ForegroundColor Green
}

# NSIS 安装器
if (Test-Path "src-tauri/target/debug/bundle/nsis/*.exe") {
    Copy-Item "src-tauri/target/debug/bundle/nsis/*.exe" -Destination $OutputDir -Force
    Write-Host "✅ NSIS installer copied" -ForegroundColor Green
}

# 生成版本信息
Write-Host "📝 Generating version info..." -ForegroundColor Cyan
$versionInfo = @"
Serial Pilot Debug Build
========================
Build Date: $(Get-Date -Format "yyyy-MM-dd HH:mm:ss")
Git Commit: $(git rev-parse --short HEAD)
Git Branch: $(git rev-parse --abbrev-ref HEAD)
Target: $Target
Build Mode: Debug
Features:
- Console output enabled
- Detailed logging enabled
- Developer tools enabled
- Test features enabled

Installation:
1. MSI Installer: Run the .msi file
2. Portable: Run serial-pilot-debug.exe directly
3. Console output will be visible

Debug Information:
- Log level: Debug
- Serial event logging: Enabled
- Detailed logs: Enabled
- Test features: Available

For issues and debugging:
- Check console output for detailed logs
- Report issues at: https://github.com/$(git remote get-url origin | ForEach-Object { $_ -replace '.*github.com[:/](.*)\.git', '$1' })/issues
"@

$versionInfo | Out-File -FilePath "$OutputDir/README_DEBUG.txt" -Encoding UTF8

Write-Host "🎉 Debug build completed successfully!" -ForegroundColor Green
Write-Host "📁 Artifacts available in: $OutputDir" -ForegroundColor Yellow

# 列出构建产物
Write-Host "📋 Build artifacts:" -ForegroundColor Cyan
Get-ChildItem $OutputDir | ForEach-Object {
    Write-Host "  - $($_.Name) ($([math]::Round($_.Length / 1MB, 2)) MB)" -ForegroundColor White
}