param(
  [string]$PlayerVoice = 'Microsoft Zira Desktop',
  [string]$BossVoice = 'Microsoft David Desktop'
)

$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Speech
$taskVoiceRoot = Join-Path (Split-Path -Parent $PSScriptRoot) 'assets/action-voice-v59'
$taskActions = [ordered]@{check='Check'; call='Call'; bet='Bet'; raise='Raise'; allin='All in'; fold='Fold'}
$taskSeats = [ordered]@{player=$PlayerVoice; boss=$BossVoice}
$taskSynth = New-Object System.Speech.Synthesis.SpeechSynthesizer
try {
  $taskAvailable = @($taskSynth.GetInstalledVoices() | Where-Object Enabled | ForEach-Object { $_.VoiceInfo.Name })
  foreach ($taskVoice in $taskSeats.Values) {
    if ($taskVoice -notin $taskAvailable) { throw "Offline voice unavailable: $taskVoice" }
  }
  if ($PlayerVoice -eq $BossVoice) { throw 'Player and BOSS must use different installed voices.' }
  $taskFormat = New-Object System.Speech.AudioFormat.SpeechAudioFormatInfo(22050, [System.Speech.AudioFormat.AudioBitsPerSample]::Sixteen, [System.Speech.AudioFormat.AudioChannel]::Mono)
  $taskSynth.Rate = 0
  $taskSynth.Volume = 100
  foreach ($taskSeat in $taskSeats.Keys) {
    $taskDirectory = Join-Path $taskVoiceRoot $taskSeat
    New-Item -ItemType Directory -Path $taskDirectory -Force | Out-Null
    $taskSynth.SelectVoice($taskSeats[$taskSeat])
    foreach ($taskAction in $taskActions.Keys) {
      $taskSynth.SetOutputToWaveFile((Join-Path $taskDirectory "$taskAction.wav"), $taskFormat)
      $taskSynth.Speak($taskActions[$taskAction])
      $taskSynth.SetOutputToNull()
    }
  }
} finally {
  $taskSynth.Dispose()
}
Write-Output "Created twelve offline English recordings in $taskVoiceRoot"
