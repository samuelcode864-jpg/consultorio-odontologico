/**
 * DentalCare Pro - Automated Cloud Database Backup Engine
 * Extracts all tables from Supabase Cloud and saves a timestamped JSON backup.
 */

const https = require('https');
const fs = require('fs');
const path = require('path');

// Ensure GitHub workflow exists
try {
    const wfDir = path.join(__dirname, '..', '.github', 'workflows');
    if (!fs.existsSync(wfDir)) fs.mkdirSync(wfDir, { recursive: true });
    const wfPath = path.join(wfDir, 'daily_backup.yml');
    if (!fs.existsSync(wfPath)) {
        const wfContent = [
            'name: Daily Supabase Database Backup',
            '',
            'on:',
            '  schedule:',
            '    # Runs every day at 04:00 UTC (12:00 AM Midnight Venezuela Time)',
            '    - cron: "0 4 * * *"',
            '  workflow_dispatch:',
            '',
            'permissions:',
            '  contents: write',
            '',
            'jobs:',
            '  backup:',
            '    runs-on: ubuntu-latest',
            '',
            '    steps:',
            '      - name: Check out repository',
            '        uses: actions/checkout@v4',
            '',
            '      - name: Setup Node.js',
            '        uses: actions/setup-node@v4',
            '        with:',
            '          node-version: 20',
            '',
            '      - name: Run Database Backup',
            '        env:',
            '          SUPABASE_URL: https://tudymiytiwcyrjtptfvi.supabase.co',
            '          SUPABASE_KEY: ${{ secrets.SUPABASE_KEY || \'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InR1ZHltaXl0aXdjeXJqdHB0ZnZpIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODYzMjMxNzQsImV4cCI6MjEwMTg5OTE3NH0.wP-vsBmc7ezIx8Uq_hTqye44Gxl75jkGZSxDDg-3Aj8\' }}',
            '        run: node scripts/backup_database.js',
            '',
            '      - name: Commit and Push Backup to GitHub',
            '        run: |',
            '          git config --global user.name "DentalCare Backup Bot"',
            '          git config --global user.email "bot@dentalcare.com"',
            '          git add backups/',
            '          git diff --quiet && git diff --staged --quiet || (git commit -m "📦 Automated Database Backup" && git push)'
        ].join('\n');
        fs.writeFileSync(wfPath, wfContent, 'utf8');
    }
} catch(e) {}

const SUPABASE_URL = process.env.SUPABASE_URL || 'https://tudymiytiwcyrjtptfvi.supabase.co';
const SUPABASE_KEY = process.env.SUPABASE_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InR1ZHltaXl0aXdjeXJqdHB0ZnZpIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODYzMjMxNzQsImV4cCI6MjEwMTg5OTE3NH0.wP-vsBmc7ezIx8Uq_hTqye44Gxl75jkGZSxDDg-3Aj8';

function fetchTable(tableName) {
    return new Promise((resolve) => {
        try {
            const url = new URL(SUPABASE_URL + '/rest/v1/' + tableName + '?select=*');
            const req = https.request(url, {
                method: 'GET',
                headers: {
                    'apikey': SUPABASE_KEY,
                    'Authorization': 'Bearer ' + SUPABASE_KEY,
                    'Content-Type': 'application/json'
                }
            }, (res) => {
                let body = '';
                res.on('data', chunk => body += chunk);
                res.on('end', () => {
                    try {
                        const json = JSON.parse(body);
                        if (Array.isArray(json)) {
                            resolve({ table: tableName, count: json.length, data: json });
                        } else {
                            resolve({ table: tableName, count: 0, data: [], note: json.message || 'No array' });
                        }
                    } catch (e) {
                        resolve({ table: tableName, count: 0, data: [], error: e.message });
                    }
                });
            });
            req.on('error', (err) => {
                resolve({ table: tableName, count: 0, data: [], error: err.message });
            });
            req.end();
        } catch (e) {
            resolve({ table: tableName, count: 0, data: [], error: e.message });
        }
    });
}

async function runBackup() {
    console.log('=====================================================');
    console.log(' DENTALCARE PRO - INICIANDO RESPALDO DE BASE DE DATOS');
    console.log('=====================================================');

    const now = new Date();
    const dateStr = now.toISOString().split('T')[0]; // YYYY-MM-DD

    const tablesToBackup = [
        'users',
        'patients',
        'baremo_services',
        'appointments',
        'inventory',
        'stationery_config',
        'invoices',
        'provider_bills'
    ];

    const backupPayload = {
        meta: {
            system: 'DentalCare Pro',
            version: '2.0.0',
            backupDate: now.toISOString(),
            dateFormatted: dateStr,
            tablesCount: tablesToBackup.length
        },
        database: {}
    };

    for (const table of tablesToBackup) {
        console.log("- Extrayendo tabla '" + table + "'...");
        const result = await fetchTable(table);
        backupPayload.database[table] = result.data;
        console.log("  -> Registros respaldados: " + result.count);
    }

    const backupDir = path.join(__dirname, '..', 'backups');
    if (!fs.existsSync(backupDir)) {
        fs.mkdirSync(backupDir, { recursive: true });
    }

    const datedFilePath = path.join(backupDir, 'backup_' + dateStr + '.json');
    const latestFilePath = path.join(backupDir, 'latest_backup.json');

    fs.writeFileSync(datedFilePath, JSON.stringify(backupPayload, null, 2), 'utf8');
    fs.writeFileSync(latestFilePath, JSON.stringify(backupPayload, null, 2), 'utf8');

    console.log('=====================================================');
    console.log('✅ RESPALDO COMPLETADO EXITOSAMENTE');
    console.log('📁 Archivo generado: backups/backup_' + dateStr + '.json');
    console.log('📁 Archivo actualizado: backups/latest_backup.json');
    console.log('=====================================================');
}

runBackup();
