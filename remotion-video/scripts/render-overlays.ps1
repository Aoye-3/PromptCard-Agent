$ErrorActionPreference = "Stop"

$browser = "../.playwright-browsers/chromium_headless_shell-1228/chrome-headless-shell-win64/chrome-headless-shell.exe"
$overlays = @(
  @{ Id = "B01-ManualTimestamp"; File = "B01-ManualTimestamp-alpha.mov" },
  @{ Id = "B02-StructureDisappears"; File = "B02-StructureDisappears-alpha.mov" },
  @{ Id = "B03-BlocksAndPages"; File = "B03-BlocksAndPages-alpha.mov" },
  @{ Id = "B04-EditAndReuse"; File = "B04-EditAndReuse-alpha.mov" },
  @{ Id = "B05-MatchingLibrary"; File = "B05-MatchingLibrary-alpha.mov" },
  @{ Id = "B06-DuplicatePage"; File = "B06-DuplicatePage-alpha.mov" }
)

foreach ($overlay in $overlays) {
  & npx.cmd remotion render $overlay.Id "out/overlays/$($overlay.File)" `
    --codec=prores `
    --prores-profile=4444 `
    --image-format=png `
    --pixel-format=yuva444p10le `
    --browser-executable=$browser

  if ($LASTEXITCODE -ne 0) {
    throw "Rendering $($overlay.Id) failed with exit code $LASTEXITCODE"
  }
}
