# Configure Windows Firewall for Deme Movies Server
# Run this script as Administrator: Right-click -> Run with PowerShell -> Yes

Write-Host "========================================" -ForegroundColor Cyan
Write-Host "  Configure Windows Firewall" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""

# Check if running as Administrator
$isAdmin = ([Security.Principal.WindowsPrincipal] [Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)

if (-not $isAdmin) {
    Write-Host "[ERROR] This script must be run as Administrator!" -ForegroundColor Red
    Write-Host ""
    Write-Host "Right-click this file and select 'Run with PowerShell' -> Yes" -ForegroundColor Yellow
    Write-Host ""
    Read-Host "Press Enter to exit"
    exit 1
}

Write-Host "[INFO] Running as Administrator... ✓" -ForegroundColor Green
Write-Host ""
Write-Host "[INFO] Creating firewall rule for port 3000..." -ForegroundColor Yellow
Write-Host ""

try {
    # Remove existing rule if it exists
    $existingRule = Get-NetFirewallRule -DisplayName "Deme Movies Server" -ErrorAction SilentlyContinue
    if ($existingRule) {
        Write-Host "[INFO] Removing existing rule..." -ForegroundColor Yellow
        Remove-NetFirewallRule -DisplayName "Deme Movies Server" -ErrorAction SilentlyContinue
    }

    # Create new firewall rule
    New-NetFirewallRule `
        -DisplayName "Deme Movies Server" `
        -Direction Inbound `
        -LocalPort 3000 `
        -Protocol TCP `
        -Action Allow `
        -Profile Private,Public `
        -Description "Allows access to Deme Movies media streaming server on port 3000"

    Write-Host ""
    Write-Host "[SUCCESS] Firewall rule created successfully!" -ForegroundColor Green
    Write-Host ""
    Write-Host "Port 3000 is now open for incoming connections." -ForegroundColor Cyan
    Write-Host "Other devices on your network can now access the server." -ForegroundColor Cyan
    Write-Host ""
    
    # Verify the rule
    $rule = Get-NetFirewallRule -DisplayName "Deme Movies Server" -ErrorAction SilentlyContinue
    if ($rule) {
        Write-Host "Rule Details:" -ForegroundColor Yellow
        $rule | Select-Object DisplayName, Enabled, Direction, Action, Profile | Format-List
    }
    
} catch {
    Write-Host ""
    Write-Host "[ERROR] Failed to create firewall rule: $_" -ForegroundColor Red
    Write-Host ""
    Write-Host "Make sure you're running as Administrator." -ForegroundColor Yellow
    Write-Host ""
}

Write-Host ""
Read-Host "Press Enter to exit"
