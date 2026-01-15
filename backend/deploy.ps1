# Azure WebApp ZIPデプロイ用スクリプト（PowerShell）
# バックエンド用

param(
    [Parameter(Mandatory=$true)]
    [string]$ResourceGroupName,
    
    [Parameter(Mandatory=$true)]
    [string]$AppName
)

Write-Host "バックエンド ZIPデプロイを開始します..."

# 現在のディレクトリを確認
if (!(Test-Path "requirements.txt")) {
    Write-Error "requirements.txt が見つかりません。backend フォルダで実行してください。"
    exit 1
}

# __pycache__ フォルダを削除
Write-Host "__pycache__ フォルダを削除中..."
Get-ChildItem -Path . -Recurse -Directory -Name "__pycache__" | ForEach-Object {
    Remove-Item -Recurse -Force $_
}

# 既存のZIPファイルを削除
if (Test-Path "backend-deploy.zip") {
    Remove-Item "backend-deploy.zip"
}

# ZIPファイルを作成
Write-Host "ZIPファイルを作成中..."
$excludeFiles = @(".env", "*.log", "*.zip", "*.pyc")
$files = Get-ChildItem -Path . | Where-Object { 
    $_.Name -notin $excludeFiles -and $_.Name -notlike "*__pycache__*"
}

Compress-Archive -Path $files -DestinationPath "backend-deploy.zip"

# Azure CLIでデプロイ
Write-Host "Azure WebApp にデプロイ中..."
az webapp deployment source config-zip `
    --resource-group $ResourceGroupName `
    --name $AppName `
    --src "backend-deploy.zip"

if ($LASTEXITCODE -eq 0) {
    Write-Host "デプロイが完了しました！" -ForegroundColor Green
    Write-Host "URL: https://$AppName.azurewebsites.net"
    Write-Host "ヘルスチェック: https://$AppName.azurewebsites.net/health"
} else {
    Write-Error "デプロイに失敗しました。"
}

# 一時ファイルを削除
Remove-Item "backend-deploy.zip"
