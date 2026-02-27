import http from 'http';
import url from 'url';
import { 
    processTranscription, 
    generateAnalyticsReport, 
    getHighPriorityCalls 
} from '../services/processor.js';
import db from '../database/connection.js';
import logger from '../utils/logger.js';

// Helper to parse JSON body
const parseBody = (req) => {
    return new Promise((resolve, reject) => {
        let body = '';
        req.on('data', chunk => body += chunk.toString());
        req.on('end', () => {
            try {
                resolve(JSON.parse(body));
            } catch (error) {
                reject(error);
            }
        });
    });
};

// Helper to send JSON response
const sendJson = (res, statusCode, data) => {
    res.writeHead(statusCode, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(data));
};

// Route handlers
const routes = {
    // Health check
    'GET /health': async (req, res) => {
        try {
            await db.query('SELECT 1');
            sendJson(res, 200, { status: 'healthy', timestamp: new Date().toISOString() });
        } catch (error) {
            sendJson(res, 503, { status: 'unhealthy', error: error.message });
        }
    },
    
    // Process single transcription manually
    'POST /api/process': async (req, res) => {
        try {
            const body = await parseBody(req);
            
            if (!body.transcription || !body.callId) {
                return sendJson(res, 400, { error: 'Missing required fields: transcription, callId' });
            }
            
            const result = await processTranscription(body.transcription, {
                callId: body.callId,
                duration: body.duration || 0,
                callerPhone: body.callerPhone,
                callDate: body.callDate || new Date()
            });
            
            sendJson(res, 200, result);
        } catch (error) {
            logger.error('Process API error:', error);
            sendJson(res, 500, { error: error.message });
        }
    },
    
    // Get analytics report
    'GET /api/analytics': async (req, res) => {
        try {
            const parsedUrl = url.parse(req.url, true);
            const { startDate, endDate } = parsedUrl.query;
            
            const start = startDate || new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
            const end = endDate || new Date().toISOString();
            
            const report = await generateAnalyticsReport(start, end);
            sendJson(res, 200, report);
        } catch (error) {
            logger.error('Analytics API error:', error);
            sendJson(res, 500, { error: error.message });
        }
    },
    
    // Get high-priority calls
    'GET /api/high-priority': async (req, res) => {
        try {
            const parsedUrl = url.parse(req.url, true);
            const limit = parseInt(parsedUrl.query.limit) || 50;
            
            const calls = await getHighPriorityCalls(limit);
            sendJson(res, 200, { calls, count: calls.length });
        } catch (error) {
            logger.error('High-priority API error:', error);
            sendJson(res, 500, { error: error.message });
        }
    },
    
    // Search call summaries by keyword (full-text search; uses idx_v2_summary_fts)
    'GET /api/summaries/search': async (req, res) => {
        try {
            const parsedUrl = url.parse(req.url, true);
            const q = parsedUrl.query.q || parsedUrl.query.query;
            const limit = Math.min(parseInt(parsedUrl.query.limit, 10) || 50, 200);

            if (!q || String(q).trim() === '') {
                return sendJson(res, 400, { error: 'Missing query parameter: q or query (keyword to search in call_summary)' });
            }

            const results = await db.searchCallSummaries(String(q).trim(), limit);
            sendJson(res, 200, { results, count: results.length });
        } catch (error) {
            logger.error('Search summaries API error:', error);
            sendJson(res, 500, { error: error.message });
        }
    },

    // Get call analysis by ID
    'GET /api/calls/:callId': async (req, res, callId) => {
        try {
            const analysis = await db.getCallAnalysisWithTags(callId);
            
            if (analysis.length === 0) {
                return sendJson(res, 404, { error: 'Call not found' });
            }
            
            sendJson(res, 200, analysis[0]);
        } catch (error) {
            logger.error('Get call API error:', error);
            sendJson(res, 500, { error: error.message });
        }
    },
    
    // Bulk insert transcriptions
    'POST /api/transcriptions/bulk': async (req, res) => {
        try {
            const body = await parseBody(req);
            
            if (!Array.isArray(body.transcriptions)) {
                return sendJson(res, 400, { error: 'transcriptions must be an array' });
            }
            
            const results = await Promise.allSettled(
                body.transcriptions.map(async (trans) => {
                    return await db.queryOne(
                        `INSERT INTO call_transcriptions 
                         (call_id, transcription, duration, caller_phone, receiver_phone, call_date)
                         VALUES ($1, $2, $3, $4, $5, $6)
                         ON CONFLICT (call_id) DO NOTHING
                         RETURNING call_id`,
                        [
                            trans.callId,
                            trans.transcription,
                            trans.duration || 0,
                            trans.callerPhone,
                            trans.receiverPhone,
                            trans.callDate || new Date()
                        ]
                    );
                })
            );
            
            const inserted = results.filter(r => r.status === 'fulfilled' && r.value).length;
            const failed = results.filter(r => r.status === 'rejected').length;
            
            sendJson(res, 200, { 
                message: 'Bulk insert completed',
                inserted,
                failed,
                total: body.transcriptions.length
            });
        } catch (error) {
            logger.error('Bulk insert API error:', error);
            sendJson(res, 500, { error: error.message });
        }
    },
    
    // Get tag statistics
    'GET /api/tags/stats': async (req, res) => {
        try {
            const stats = await db.query(`
                SELECT 
                    td.tag_name,
                    td.priority,
                    td.importance,
                    COUNT(ct.call_id) AS usage_count,
                    AVG(ct.confidence) AS avg_confidence
                FROM tag_definitions td
                LEFT JOIN call_tags ct ON td.id = ct.tag_id
                GROUP BY td.id, td.tag_name, td.priority, td.importance
                ORDER BY 
                    CASE td.priority 
                        WHEN 'Highest' THEN 1
                        WHEN 'High' THEN 2
                        WHEN 'Medium' THEN 3
                        WHEN 'Lower' THEN 4
                    END,
                    usage_count DESC
            `);
            
            sendJson(res, 200, stats);
        } catch (error) {
            logger.error('Tag stats API error:', error);
            sendJson(res, 500, { error: error.message });
        }
    },

    // ── Campaign Prompts ───────────────────────────────────────────────────────

    // List all prompts (metadata only; no body text).
    // Optional query param: ?campaign_id=CAxxx
    'GET /api/prompts': async (req, res) => {
        try {
            const parsedUrl = url.parse(req.url, true);
            const { campaign_id } = parsedUrl.query;
            const filter = campaign_id === undefined ? undefined : campaign_id;

            const prompts = await db.listPrompts(filter);
            sendJson(res, 200, { prompts, count: prompts.length });
        } catch (error) {
            logger.error('List prompts API error:', error);
            sendJson(res, 500, { error: error.message });
        }
    },

    // Get a single prompt by numeric id — returns full system_prompt text.
    'GET /api/prompts/:id': async (req, res, id) => {
        try {
            const prompt = await db.getPromptById(id);
            if (!prompt) return sendJson(res, 404, { error: 'Prompt not found' });
            sendJson(res, 200, prompt);
        } catch (error) {
            logger.error('Get prompt API error:', error);
            sendJson(res, 500, { error: error.message });
        }
    },

    // Create a new prompt version.
    // Automatically deactivates the currently-active prompt for the same campaign.
    //
    // Body:
    //   system_prompt   string  REQUIRED — full prompt text
    //   campaign_id     string  REQUIRED — no global default
    //   campaign_name   string  optional
    //   prompt_version  string  optional — default "V5"
    //   notes           string  optional
    'POST /api/prompts': async (req, res) => {
        try {
            const body = await parseBody(req);

            if (!body.system_prompt || body.system_prompt.trim() === '') {
                return sendJson(res, 400, { error: 'Missing required field: system_prompt' });
            }
            if (!body.campaign_id || String(body.campaign_id).trim() === '') {
                return sendJson(res, 400, { error: 'Missing required field: campaign_id (no global prompt)' });
            }

            const campaignId = String(body.campaign_id).trim();

            const created = await db.createPromptVersion(
                campaignId,
                body.campaign_name ?? null,
                body.prompt_version ?? 'V5',
                body.system_prompt.trim(),
                body.notes ?? null
            );

            sendJson(res, 201, { message: 'Prompt version created', prompt: created });
        } catch (error) {
            logger.error('Create prompt API error:', error);
            sendJson(res, 500, { error: error.message });
        }
    },

    // Update prompt metadata (campaign_name, notes, prompt_version).
    // To change the actual system_prompt text, use POST /api/prompts (new version).
    //
    // Body (all optional):
    //   campaign_name   string
    //   prompt_version  string
    //   notes           string
    'PUT /api/prompts/:id': async (req, res, id) => {
        try {
            const body = await parseBody(req);

            const updated = await db.updatePromptMeta(id, {
                campaign_name: body.campaign_name,
                notes:         body.notes,
                prompt_version: body.prompt_version
            });

            if (!updated) return sendJson(res, 404, { error: 'Prompt not found' });
            sendJson(res, 200, { message: 'Prompt metadata updated', prompt: updated });
        } catch (error) {
            logger.error('Update prompt API error:', error);
            sendJson(res, 500, { error: error.message });
        }
    },

    // Deactivate a prompt (soft delete — keeps historical record).
    'DELETE /api/prompts/:id': async (req, res, id) => {
        try {
            const result = await db.deactivatePrompt(id);
            if (!result) return sendJson(res, 404, { error: 'Prompt not found' });
            sendJson(res, 200, { message: 'Prompt deactivated', prompt: result });
        } catch (error) {
            logger.error('Deactivate prompt API error:', error);
            sendJson(res, 500, { error: error.message });
        }
    }
};

// Main request handler
const handleRequest = async (req, res) => {
    const parsedUrl = url.parse(req.url, true);
    const method = req.method;
    const pathname = parsedUrl.pathname;
    
    // Enable CORS
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    
    // Handle OPTIONS requests
    if (method === 'OPTIONS') {
        res.writeHead(204);
        res.end();
        return;
    }
    
    // Log request
    logger.info(`${method} ${pathname}`);
    
    // Match routes
    const routeKey = `${method} ${pathname}`;
    
    // Check for exact match
    if (routes[routeKey]) {
        return await routes[routeKey](req, res);
    }
    
    // Check for parameterized routes

    if (method === 'GET' && pathname.startsWith('/api/calls/')) {
        const callId = pathname.split('/')[3];
        return await routes['GET /api/calls/:callId'](req, res, callId);
    }

    if (pathname.startsWith('/api/prompts/')) {
        const id = pathname.split('/')[3];
        if (method === 'GET')    return await routes['GET /api/prompts/:id'](req, res, id);
        if (method === 'PUT')    return await routes['PUT /api/prompts/:id'](req, res, id);
        if (method === 'DELETE') return await routes['DELETE /api/prompts/:id'](req, res, id);
    }

    // 404 for unmatched routes
    sendJson(res, 404, { error: 'Route not found' });
};

// Create and start server
const server = http.createServer(handleRequest);

export default {
    start: (port = 3000) => {
        return new Promise((resolve, reject) => {
            server.listen(port, (error) => {
                if (error) {
                    logger.error('Failed to start API server:', error);
                    reject(error);
                } else {
                    logger.info(`API server listening on port ${port}`);
                    logger.info('Available endpoints:');
                    logger.info('  GET  /health - Health check');
                    logger.info('  POST /api/process - Process single transcription');
                    logger.info('  GET  /api/analytics - Get analytics report');
                    logger.info('  GET  /api/high-priority - Get high-priority calls');
                    logger.info('  GET  /api/summaries/search?q=keyword - Keyword search in call summaries (FTS)');
                    logger.info('  GET  /api/calls/:callId - Get call analysis by ID');
                    logger.info('  POST /api/transcriptions/bulk - Bulk insert transcriptions');
                    logger.info('  GET  /api/tags/stats - Get tag usage statistics');
                    logger.info('  GET  /api/prompts - List all prompts (metadata)');
                    logger.info('  GET  /api/prompts?campaign_id=X - Filter by campaign');
                    logger.info('  GET  /api/prompts/:id - Get prompt with full text');
                    logger.info('  POST /api/prompts - Create new prompt version');
                    logger.info('  PUT  /api/prompts/:id - Update prompt metadata');
                    logger.info('  DELETE /api/prompts/:id - Deactivate a prompt');
                    resolve();
                }
            });
        });
    },
    
    stop: () => {
        return new Promise((resolve) => {
            server.close(() => {
                logger.info('API server stopped');
                resolve();
            });
        });
    }
};
