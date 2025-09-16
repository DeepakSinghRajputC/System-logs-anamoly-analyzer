import express from 'express';
import axios from 'axios';
import dotenv from 'dotenv';
import { initDb, insertLogs, insertIncident, getIncidents } from './db.js';
import child_process from 'child_process';

dotenv.config();

const app = express();
app.use(express.json({ limit: '2mb' }));

const STARTED_AT = new Date().toISOString();
const THRESHOLD = process.env.THRESHOLD ? Number(process.env.THRESHOLD) : 0.8;
const ML_URL = process.env.ML_URL || 'http://ml-service:8000/score';

initDb();

function extractFeatures(logs) {
    const levels = { WARN: 0, ERROR: 0 };
    let failedLogins = 0;
    const loginRegex = /(failed\s*login|auth\s*fail|invalid\s*password)/i;

    for (const l of logs) {
        if (String(l.level).toUpperCase() === 'WARN') levels.WARN += 1;
        if (String(l.level).toUpperCase() === 'ERROR') levels.ERROR += 1;
        if (loginRegex.test(l.message)) failedLogins += 1;
    }

    return {
        count: logs.length,
        warn_count: levels.WARN,
        error_count: levels.ERROR,
        failed_login_count: failedLogins,
        services: [...new Set(logs.map((l) => l.service))],
    };
}

function getGitMeta() {
    try {
        const commit = child_process.execSync('git rev-parse HEAD', { stdio: ['ignore', 'pipe', 'ignore'] })
            .toString()
            .trim();
        const branch = child_process.execSync('git rev-parse --abbrev-ref HEAD', { stdio: ['ignore', 'pipe', 'ignore'] })
            .toString()
            .trim();
        return { commit, branch };
    } catch {
        return { commit: null, branch: null };
    }
}

app.post('/ingest', async (req, res) => {
    try {
        const logs = Array.isArray(req.body) ? req.body : req.body.logs;
        if (!Array.isArray(logs)) {
            return res.status(400).json({ error: 'Body must be an array of logs or {logs: [...]}.' });
        }

        for (const [i, l] of logs.entries()) {
            if (!l || !l.timestamp || !l.service || !l.level || !l.message) {
                return res.status(400).json({ error: `Invalid log at index ${i}` });
            }
        }

        await insertLogs(logs);

        const features = extractFeatures(logs);
        const mlFeatures = {
            failed_logins: features.failed_login_count,
            error_rate: features.count > 0 ? features.error_count / features.count : 0,
        };

        let score = 0;
        try {
            const { data } = await axios.post(ML_URL, { features: mlFeatures });
            score = typeof data?.score === 'number' ? data.score : 0;
        } catch (err) {
            // If ML service is unreachable, degrade gracefully
            score = 0;
        }

        let incidentId = null;
        if (score > THRESHOLD) {
            const summary = `Anomalous activity detected: errors=${features.error_count}, warns=${features.warn_count}, failed_logins=${features.failed_login_count}`;
            incidentId = await insertIncident({
                detected_at: new Date().toISOString(),
                service: features.services.length === 1 ? features.services[0] : null,
                severity: score,
                summary,
                features,
            });
        }

        res.json({ stored: logs.length, features, score, threshold: THRESHOLD, incident_id: incidentId });
    } catch (err) {
        res.status(500).json({ error: 'Internal server error' });
    }
});

app.get('/incidents', async (_req, res) => {
    try {
        const incidents = await getIncidents();
        res.json({ incidents });
    } catch (err) {
        res.status(500).json({ error: 'Internal server error' });
    }
});

app.get('/meta', (_req, res) => {
    const git = getGitMeta();
    const model = process.env.MODEL_VERSION || 'unknown';
    res.json({ git, model, started_at: STARTED_AT });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`Server listening on port ${PORT}`);
});
