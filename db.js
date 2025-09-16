import sqlite3 from 'sqlite3';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const dbPath = path.join(__dirname, 'data.sqlite');

sqlite3.verbose();
const db = new sqlite3.Database(dbPath);

export function initDb() {
    db.serialize(() => {
        db.run(
            `CREATE TABLE IF NOT EXISTS logs (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        timestamp TEXT NOT NULL,
        service TEXT NOT NULL,
        level TEXT NOT NULL,
        message TEXT NOT NULL,
        metadata TEXT,
        created_at TEXT NOT NULL
      )`
        );

        db.run(
            `CREATE TABLE IF NOT EXISTS incidents (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        detected_at TEXT NOT NULL,
        service TEXT,
        severity REAL NOT NULL,
        summary TEXT NOT NULL,
        features TEXT NOT NULL
      )`
        );
    });
}

export function insertLogs(logs) {
    return new Promise((resolve, reject) => {
        const stmt = db.prepare(
            'INSERT INTO logs (timestamp, service, level, message, metadata, created_at) VALUES (?, ?, ?, ?, ?, ?)'
        );

        const createdAt = new Date().toISOString();
        db.serialize(() => {
            for (const log of logs) {
                const metaStr = log.metadata ? JSON.stringify(log.metadata) : null;
                stmt.run(
                    log.timestamp,
                    log.service,
                    log.level,
                    log.message,
                    metaStr,
                    createdAt
                );
            }
            stmt.finalize((err) => {
                if (err) return reject(err);
                resolve();
            });
        });
    });
}

export function insertIncident({ detected_at, service, severity, summary, features }) {
    return new Promise((resolve, reject) => {
        const stmt = db.prepare(
            'INSERT INTO incidents (detected_at, service, severity, summary, features) VALUES (?, ?, ?, ?, ?)'
        );
        stmt.run(detected_at, service || null, severity, summary, JSON.stringify(features), function (err) {
            if (err) return reject(err);
            resolve(this.lastID);
        });
    });
}

export function getIncidents() {
    return new Promise((resolve, reject) => {
        db.all('SELECT * FROM incidents ORDER BY id DESC', (err, rows) => {
            if (err) return reject(err);
            const parsed = rows.map((r) => ({ ...r, features: JSON.parse(r.features) }));
            resolve(parsed);
        });
    });
}
