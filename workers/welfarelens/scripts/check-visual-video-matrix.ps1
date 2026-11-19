param(
    [Parameter(Mandatory)][string]$InputVideo,
    [Parameter(Mandatory)][string]$PrivateDirectory
)

$ErrorActionPreference = 'Stop'
$source = (Resolve-Path -LiteralPath $InputVideo).Path
$project = Split-Path -Parent $PSScriptRoot
Push-Location $project
try {
    if ([IO.Path]::IsPathRooted($PrivateDirectory)) {
        $root = [IO.Path]::GetFullPath($PrivateDirectory)
    } else {
        $root = [IO.Path]::GetFullPath((Join-Path $project $PrivateDirectory))
    }
    $privateRoot = Join-Path $project 'private-eval'
    if (!$root.StartsWith($privateRoot + [IO.Path]::DirectorySeparatorChar, [StringComparison]::OrdinalIgnoreCase)) {
        throw 'Use a new directory under private-eval.'
    }
    if (Test-Path -LiteralPath $root) { throw 'Use a new matrix directory.' }
    New-Item -ItemType Directory -Path $root | Out-Null
    $ffmpeg = if ($env:FFMPEG_PATH) { $env:FFMPEG_PATH } else { 'ffmpeg' }
    $fixture = Join-Path $project 'evals/fixtures/worker-scene.json'
    $empty = Join-Path $root 'empty.json'
    $data = Get-Content -Raw -LiteralPath $fixture -Encoding UTF8 | ConvertFrom-Json
    $data.candidate.objects = @()
    $data.candidate.assessments = @()
    [IO.File]::WriteAllText($empty, ($data | ConvertTo-Json -Depth 10))
    $matrix = @(
        @{ name='original'; file=$source; fixture=$fixture },
        @{ name='short'; options=@('-t','4','-vf','scale=960:-2'); fixture=$fixture },
        @{ name='long'; options=@('-stream_loop','3','-t','45','-vf','scale=960:-2'); fixture=$fixture },
        @{ name='portrait-dark'; options=@('-t','8','-vf','crop=ih*9/16:ih,scale=360:640,eq=brightness=-0.2','-crf','34'); fixture=$empty }
    )
    foreach ($case in $matrix) {
        $video = $case.file
        if (!$video) {
            $video = Join-Path $root ($case.name + '.mp4')
            $inputOptions = @()
            $outputOptions = $case.options
            if ($case.name -eq 'long') {
                $inputOptions = $case.options[0..1]
                $outputOptions = $case.options[2..5]
            }
            & $ffmpeg -v error -nostdin @inputOptions -i $source @outputOptions -an -c:v libx264 -threads 2 -preset fast $video
            if ($LASTEXITCODE) { throw "FFmpeg failed for $($case.name)" }
        }
        try {
            $log = node --experimental-strip-types scripts/standalone-worker.ts --input $video --fixture $case.fixture --root (Join-Path $root ('jobs-' + $case.name))
            if ($LASTEXITCODE) { throw "Worker failed for $($case.name)" }
        } finally {
            if (!$case.file) { Remove-Item -LiteralPath $video }
        }
        $result = $log[-1] | ConvertFrom-Json
        if ($result.actual_azure -or $result.stages.editing -ne 'not_requested') { throw 'Fixture triggered cloud mode.' }
        [pscustomobject]@{ case=$case.name; outcome=$result.outcome; frames=$result.metrics.analyzedFrames; ms=[int]$result.metrics.totalMs; pdf=$result.stages.pdf } | ConvertTo-Json -Compress
    }
}
finally { Pop-Location }
