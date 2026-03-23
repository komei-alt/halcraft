// ============================================
// ハルクラ Deploy Webhook サーバー
// GitHub Webhook を受けて自動デプロイを実行
// ============================================

const http = require('http');
const crypto = require('crypto');
const { execSync, exec } = require('child_process');
const fs = require('fs');

const PORT = process.env.WEBHOOK_PORT || 9000;
const SECRET = process.env.WEBHOOK_SECRET || '';
const REPO_DIR = '/volume1/docker/halcraft-repo';
const LOG_FILE = '/var/log/halcraft-deploy.log';

let isDeploying = false;

function log(msg) {
  const timestamp = new Date().toISOString();
  const line = `[${timestamp}] ${msg}`;
  console.log(line);
  try {
    fs.appendFileSync(LOG_FILE, line + '\n');
  } catch { /* ログファイルに書けなくても続行 */ }
}

function verifySignature(payload, signature) {
  if (!SECRET) return true; // シークレット未設定なら検証スキップ
  if (!signature) return false;
  const hmac = crypto.createHmac('sha256', SECRET);
  hmac.update(payload);
  const expected = 'sha256=' + hmac.digest('hex');
  return crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expected));
}

function deploy() {
  if (isDeploying) {
    log('⏳ デプロイ実行中のためスキップ');
    return;
  }

  isDeploying = true;
  log('🚀 === デプロイ開始 ===');

  exec(`
    cd ${REPO_DIR} && \
    git pull origin main && \
    docker compose -f ${REPO_DIR}/docker-compose.yml build --no-cache halcraft && \
    docker compose -f ${REPO_DIR}/docker-compose.yml up -d --force-recreate halcraft
  `, { timeout: 300000, maxBuffer: 10 * 1024 * 1024 }, (error, stdout, stderr) => {
    if (error) {
      log(`❌ デプロイ失敗: ${error.message}`);
      if (stderr) log(`STDERR: ${stderr.slice(-500)}`);
    } else {
      log('✅ === デプロイ完了 ===');
    }
    if (stdout) log(`出力: ${stdout.slice(-500)}`);
    isDeploying = false;
  });
}

const server = http.createServer((req, res) => {
  // ヘルスチェック
  if (req.url === '/webhook/health' && req.method === 'GET') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ status: 'ok', deploying: isDeploying }));
    return;
  }

  // デプロイ Webhook
  if (req.url === '/webhook/deploy' && req.method === 'POST') {
    let body = '';
    req.on('data', chunk => { body += chunk; });
    req.on('end', () => {
      // 署名検証
      const signature = req.headers['x-hub-signature-256'];
      if (SECRET && !verifySignature(body, signature)) {
        log('⚠️ 署名検証失敗');
        res.writeHead(403, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'invalid signature' }));
        return;
      }

      // push イベントのみ処理
      const event = req.headers['x-github-event'];
      if (event && event !== 'push') {
        log(`ℹ️ ${event} イベント — スキップ`);
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ status: 'skipped', event }));
        return;
      }

      // main ブランチのみ
      try {
        const payload = JSON.parse(body);
        if (payload.ref && payload.ref !== 'refs/heads/main') {
          log(`ℹ️ ${payload.ref} ブランチ — スキップ`);
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ status: 'skipped', ref: payload.ref }));
          return;
        }
      } catch { /* パース失敗でも続行 */ }

      log('📩 GitHub push Webhook 受信');
      deploy();

      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ status: 'deploying' }));
    });
    return;
  }

  // 404
  res.writeHead(404, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify({ error: 'not found' }));
});

server.listen(PORT, () => {
  log(`🎯 Webhook サーバー起動 — port ${PORT}`);
});
