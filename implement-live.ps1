$ErrorActionPreference = 'Stop'

$previewRoot = Split-Path -Parent $MyInvocation.MyCommand.Path
$siteRoot = 'C:\Users\tsuba\AppTalentHub\02_product\01_projects\Public\灰華-HAIKA\site'
$sourceHtml = Join-Path $previewRoot 'dist\index.html'
$targetHtml = Join-Path $siteRoot 'hanabi.html'
$backupHtml = Join-Path $previewRoot 'reference\hanabi-before-art-redesign.html'

New-Item -ItemType Directory -Force -Path (Split-Path -Parent $backupHtml) | Out-Null
Copy-Item -LiteralPath $targetHtml -Destination $backupHtml -Force

$preview = Get-Content -Raw -LiteralPath $sourceHtml
$bodyMatch = [regex]::Match($preview, '(?s)<body>(.*)</body>')
if (-not $bodyMatch.Success) {
  throw 'Could not find the preview body.'
}

$head = @'
<!doctype html>
<html lang="ja">
<head>
<!-- Google tag (gtag.js) -->
<script async src="https://www.googletagmanager.com/gtag/js?id=G-SX9DN3FV3E"></script>
<script>
  window.dataLayer = window.dataLayer || [];
  function gtag(){dataLayer.push(arguments);}
  gtag('js', new Date());
  gtag('config', 'G-SX9DN3FV3E');
</script>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>灰華 -HAIKA- ｜ 4th「華火 -HANABI-」全8曲</title>
<link rel="canonical" href="https://haikaband.com/hanabi.html">
<meta name="robots" content="index,follow,max-image-preview:large">
<meta name="description" content="灰華 -HAIKA- 4thアルバム「華火 -HANABI-」全8曲。各曲YouTubeで視聴・歌詞・歌詞カード。一瞬で消えると知っていて、それでも見上げる。">
<meta name="author" content="灰華 -HAIKA-">
<meta name="theme-color" content="#e8eef0">
<meta property="og:type" content="music.album">
<meta property="og:site_name" content="灰華 -HAIKA-">
<meta property="og:locale" content="ja_JP">
<meta property="og:url" content="https://haikaband.com/hanabi.html">
<meta property="og:title" content="灰華 -HAIKA- ｜ 華火 -HANABI-">
<meta property="og:description" content="灰華 -HAIKA- 4thアルバム「華火 -HANABI-」全8曲。各曲YouTubeで視聴・歌詞・歌詞カード。一瞬で消えると知っていて、それでも見上げる。">
<meta property="og:image" content="https://haikaband.com/assets/og_hanabi.jpg">
<meta property="og:image:alt" content="4th Album 華火 -HANABI-">
<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:title" content="灰華 -HAIKA- ｜ 華火 -HANABI-">
<meta name="twitter:description" content="灰華 -HAIKA- 4thアルバム「華火 -HANABI-」全8曲。各曲YouTubeで視聴・歌詞・歌詞カード。">
<meta name="twitter:image" content="https://haikaband.com/assets/og_hanabi.jpg">
<script type="application/ld+json">
{
  "@context":"https://schema.org","@type":"MusicAlbum",
  "name":"華火 -HANABI-","alternateName":"HANABI","numTracks":8,
  "image":"https://haikaband.com/assets/cover4_sq.jpg",
  "byArtist":{"@type":"MusicGroup","name":"灰華 -HAIKA-","url":"https://haikaband.com/"}
}
</script>
<link rel="icon" href="data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 32 32'%3E%3Crect width='32' height='32' fill='%23142732'/%3E%3Ctext x='16' y='23' text-anchor='middle' font-size='24' fill='%23e9eff0'%3E華%3C/text%3E%3C/svg%3E">
<link rel="stylesheet" href="assets/hanabi-art.css?v=20260911">
<script src="assets/hanabi-art.js?v=20260911" defer></script>
</head>
'@

$finalHtml = $head + "`r`n<body>" + $bodyMatch.Groups[1].Value + "</body>`r`n</html>`r`n"
[System.IO.File]::WriteAllText($targetHtml, $finalHtml, [System.Text.UTF8Encoding]::new($false))

Copy-Item -LiteralPath (Join-Path $previewRoot 'dist\style.css') -Destination (Join-Path $siteRoot 'assets\hanabi-art.css') -Force
Copy-Item -LiteralPath (Join-Path $previewRoot 'dist\app.js') -Destination (Join-Path $siteRoot 'assets\hanabi-art.js') -Force
Copy-Item -LiteralPath (Join-Path $previewRoot 'dist\assets\hanabi-afterglow.png') -Destination (Join-Path $siteRoot 'assets\hanabi-afterglow.png') -Force

Write-Output 'Implemented hanabi redesign and saved the previous page in reference/.'
