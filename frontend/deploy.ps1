# Azure WebApp ZIPデプロイ用スクリプト（PowerShell）
# フロントエンド用

param(
    [Parameter(Mandatory=$true)]
    [string]$ResourceGroupName,
    
    [Parameter(Mandatory=$true)]
    [string]$AppName
)

Write-Host "フロントエンド ZIPデプロイを開始します..."

# 現在のディレクトリを確認
if (!(Test-Path "package.json")) {
    Write-Error "package.json が見つかりません。frontend フォルダで実行してください。"
    exit 1
}

# node_modules を削除（存在する場合）
if (Test-Path "node_modules") {
    Write-Host "node_modules を削除中..."
    Remove-Item -Recurse -Force "node_modules"
}

# 既存のZIPファイルを削除
if (Test-Path "frontend-deploy.zip") {
    Remove-Item "frontend-deploy.zip"
}

# ZIPファイルを作成
Write-Host "ZIPファイルを作成中..."
$excludeFiles = @(".env", "*.log", "*.zip")
$files = Get-ChildItem -Path . | Where-Object { 
    $_.Name -notin $excludeFiles -and $_.Name -ne "node_modules" 
}

Compress-Archive -Path $files -DestinationPath "frontend-deploy.zip"

# Azure CLIでデプロイ
Write-Host "Azure WebApp にデプロイ中..."
az webapp deployment source config-zip `
    --resource-group $ResourceGroupName `
    --name $AppName `
    --src "frontend-deploy.zip"

if ($LASTEXITCODE -eq 0) {
    Write-Host "デプロイが完了しました！" -ForegroundColor Green
    Write-Host "URL: https://$AppName.azurewebsites.net"
} else {
    Write-Error "デプロイに失敗しました。"
}

# 一時ファイルを削除
Remove-Item "frontend-deploy.zip"
