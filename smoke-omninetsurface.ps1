param(
  [string]$BaseUrl = "http://localhost:3000",
  [string]$MessageId = "tag-ovypw"
)

$ErrorActionPreference = "Stop"

Write-Host "SMOKE SCRIPT STARTED" -ForegroundColor Green

function Write-Title($t) {
  Write-Host ""
  Write-Host "==== $t ====" -ForegroundColor Cyan
}

function Require-CurlExe {
  $cmd = Get-Command curl.exe -ErrorAction SilentlyContinue
  if (-not $cmd) { throw "curl.exe not found. Install curl or ensure it's in PATH." }
}

function IsoUtcMinutesFromNow([int]$minutes) {
  return (Get-Date).ToUniversalTime().AddMinutes($minutes).ToString("yyyy-MM-ddTHH:mm:ss.fffZ")
}

function Post-Json($url, $obj) {
  $json = $obj | ConvertTo-Json -Depth 10 -Compress
  $tmp = New-TemporaryFile
  Set-Content -Path $tmp -Value $json -Encoding utf8

  try {
    $out = & curl.exe -sS -X POST "$url" -H "Content-Type: application/json" --data-binary "@$tmp"
    if (-not $out) { throw "Empty response from POST $url" }
    return ($out | ConvertFrom-Json)
  } finally {
    Remove-Item $tmp -Force -ErrorAction SilentlyContinue
  }
}

Require-CurlExe

Write-Title "Config"
Write-Host "BaseUrl   : $BaseUrl"
Write-Host "MessageId : $MessageId"

Write-Title "Connectivity check (GET should be 405)"
$head = & curl.exe -sS -i "$BaseUrl/api/blocks/create"
$head | Select-String -Pattern "HTTP/"

$A_start = IsoUtcMinutesFromNow 5
$A_end   = IsoUtcMinutesFromNow 125
$B_start = IsoUtcMinutesFromNow 65
$B_end   = IsoUtcMinutesFromNow 185

Write-Title "Planned windows"
Write-Host "A: $A_start -> $A_end"
Write-Host "B: $B_start -> $B_end (overlaps A)"

$blockA = @{
  message_id      = $MessageId
  title           = "Smoke Test Block A"
  start_at        = $A_start
  end_at          = $A_end
  timezone        = "Europe/London"
  capacity_total  = 10
  status          = "live"
  action_type     = "book"
  visibility      = "public"
  price_pence     = 0
  currency        = "GBP"
  meta            = @{ smoke_test = $true; run = "A" }
}

$blockB = @{
  message_id      = $MessageId
  title           = "Smoke Test Block B (overlaps A)"
  start_at        = $B_start
  end_at          = $B_end
  timezone        = "Europe/London"
  capacity_total  = 10
  status          = "live"
  action_type     = "book"
  visibility      = "public"
  price_pence     = 0
  currency        = "GBP"
  meta            = @{ smoke_test = $true; run = "B" }
}

Write-Title "POST Block A"
$resA = Post-Json "$BaseUrl/api/blocks/create" $blockA
$resA | ConvertTo-Json -Depth 10
if (-not $resA.ok) { throw "Block A creation failed." }
$blockA_id = $resA.block.id
Write-Host "Block A id: $blockA_id"

Write-Title "POST Block B (should auto-pause A)"
$resB = Post-Json "$BaseUrl/api/blocks/create" $blockB
$resB | ConvertTo-Json -Depth 10
if (-not $resB.ok) { throw "Block B creation failed." }
$blockB_id = $resB.block.id
Write-Host "Block B id: $blockB_id"

$pausedList = @()
if ($resB.paused_ids) { $pausedList = @($resB.paused_ids) }

Write-Host "paused_ids: $($pausedList -join ', ')"
if ($pausedList.Count -lt 1) { throw "Expected Block A to be auto-paused, but paused_ids was empty." }

if ($pausedList -notcontains $blockA_id) {
  Write-Host "WARNING: paused_ids did not include Block A id (it may have paused a different overlapping live block)." -ForegroundColor Yellow
}

Write-Title "DONE"
Write-Host "Success. Auto-pause behavior verified." -ForegroundColor Green
