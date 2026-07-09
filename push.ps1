# push.ps1
param (
    [Parameter(Position=0)]
    [string]$CommitMessage
)

git add .

$diff = git diff --staged

if (-not $diff) {
    Write-Host "Nothing to commit."
    exit
}

$msg = ""

if ($CommitMessage) {
    $msg = $CommitMessage
} else {
    $body = @{
        model = "google/gemma-4-e4b"
        messages = @(
            @{ role = "system"; content = "You write short git commit messages. One line, max 72 chars, no quotes, no explanation." }
            @{ role = "user"; content = "Write a commit message for this diff:`n$diff" }
        )
        max_tokens = 60
        temperature = 0.3
    } | ConvertTo-Json -Depth 5

    try {
        $response = Invoke-RestMethod -Uri "http://localhost:1234/v1/chat/completions" `
            -Method POST `
            -ContentType "application/json" `
            -Body $body

        $msg = $response.choices[0].message.content.Trim()
    } catch {
        $msg = ""
    }
}

if (-not $msg) {
    $msg = "update: $(Get-Date -Format 'yyyy-MM-dd HH:mm')"
}

Write-Host "Commit message: $msg"
git commit -m "$msg"
git push origin main