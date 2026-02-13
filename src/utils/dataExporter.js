import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import db from '../database/connection.js';
import logger from './logger.js';
import { format } from 'date-fns';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Export functions
const exporters = {
    // Export call analysis to CSV
    exportCallAnalysisCSV: async (startDate, endDate, outputPath) => {
        const query = `
            SELECT 
                ca.id as call_id,
                ct.call_date,
                ct.duration,
                ct.caller_phone,
                ca.summary,
                ca.sentiment,
                ca.confidence_score,
                string_agg(td.tag_name, '|') as tags,
                string_agg(cast(tags.confidence as text), '|') as tag_confidences
            FROM call_analysis ca
            JOIN call_transcriptions ct ON ca.id = ct.call_id
            LEFT JOIN call_tags tags ON ca.id = tags.call_id
            LEFT JOIN tag_definitions td ON tags.tag_id = td.id
            WHERE ca.processed_at BETWEEN $1 AND $2
            GROUP BY ca.id, ct.call_date, ct.duration, ct.caller_phone, 
                     ca.summary, ca.sentiment, ca.confidence_score
            ORDER BY ct.call_date DESC`;
        
        const results = await db.query(query, [startDate, endDate]);
        
        const csv = [
            'Call ID,Date,Duration,Caller Phone,Summary,Sentiment,Confidence,Tags,Tag Confidences',
            ...results.map(row => 
                `"${row.call_id}","${row.call_date}",${row.duration},"${row.caller_phone}","${row.summary}","${row.sentiment}",${row.confidence_score},"${row.tags || ''}","${row.tag_confidences || ''}"`
            )
        ].join('\n');
        
        fs.writeFileSync(outputPath, csv);
        logger.info(`Exported ${results.length} call analyses to ${outputPath}`);
        return results.length;
    },
    
    // Export tag frequency report
    exportTagFrequencyReport: async (startDate, endDate, outputPath) => {
        const query = `
            SELECT 
                td.priority,
                td.tag_name,
                td.importance,
                COUNT(ct.id) as usage_count,
                AVG(ct.confidence) as avg_confidence,
                MIN(ct.confidence) as min_confidence,
                MAX(ct.confidence) as max_confidence
            FROM tag_definitions td
            LEFT JOIN call_tags ct ON td.id = ct.tag_id
            LEFT JOIN call_analysis ca ON ct.call_id = ca.id
            WHERE ca.processed_at BETWEEN $1 AND $2 OR ca.processed_at IS NULL
            GROUP BY td.id, td.priority, td.tag_name, td.importance
            ORDER BY 
                CASE td.priority 
                    WHEN 'Highest' THEN 1
                    WHEN 'High' THEN 2
                    WHEN 'Medium' THEN 3
                    WHEN 'Lower' THEN 4
                END,
                usage_count DESC`;
        
        const results = await db.query(query, [startDate, endDate]);
        
        const report = {
            generated_at: new Date().toISOString(),
            period: { start: startDate, end: endDate },
            tag_statistics: results.map(row => ({
                priority: row.priority,
                tag_name: row.tag_name,
                importance: row.importance,
                usage_count: parseInt(row.usage_count),
                avg_confidence: parseFloat(row.avg_confidence) || 0,
                min_confidence: parseFloat(row.min_confidence) || 0,
                max_confidence: parseFloat(row.max_confidence) || 0
            }))
        };
        
        fs.writeFileSync(outputPath, JSON.stringify(report, null, 2));
        logger.info(`Exported tag frequency report to ${outputPath}`);
        return results.length;
    },
    
    // Export high-priority calls for review
    exportHighPriorityCalls: async (outputPath, limit = 100) => {
        const query = `
            SELECT 
                ca.id as call_id,
                ct.call_date,
                ct.duration,
                ct.caller_phone,
                ct.transcription,
                ca.summary,
                ca.sentiment,
                json_agg(
                    json_build_object(
                        'tag_name', td.tag_name,
                        'priority', td.priority,
                        'confidence', tags.confidence,
                        'reason', tags.detected_reason
                    )
                ) FILTER (WHERE td.priority IN ('Highest', 'High')) as critical_tags
            FROM call_analysis ca
            JOIN call_transcriptions ct ON ca.id = ct.call_id
            JOIN call_tags tags ON ca.id = tags.call_id
            JOIN tag_definitions td ON tags.tag_id = td.id
            WHERE td.priority IN ('Highest', 'High')
            AND tags.confidence > 0.7
            GROUP BY ca.id, ct.call_date, ct.duration, ct.caller_phone, 
                     ct.transcription, ca.summary, ca.sentiment
            ORDER BY 
                MAX(CASE td.priority WHEN 'Highest' THEN 1 WHEN 'High' THEN 2 END),
                ct.call_date DESC
            LIMIT $1`;
        
        const results = await db.query(query, [limit]);
        
        const report = {
            generated_at: new Date().toISOString(),
            total_high_priority_calls: results.length,
            calls: results
        };
        
        fs.writeFileSync(outputPath, JSON.stringify(report, null, 2));
        logger.info(`Exported ${results.length} high-priority calls to ${outputPath}`);
        return results.length;
    },
    
    // Generate daily summary
    exportDailySummary: async (date, outputPath) => {
        const startOfDay = new Date(date);
        startOfDay.setHours(0, 0, 0, 0);
        const endOfDay = new Date(date);
        endOfDay.setHours(23, 59, 59, 999);
        
        const summaryQuery = `
            WITH daily_stats AS (
                SELECT 
                    COUNT(DISTINCT ca.id) as total_calls,
                    AVG(ct.duration) as avg_duration,
                    AVG(ca.confidence_score) as avg_confidence,
                    COUNT(DISTINCT CASE WHEN ca.sentiment = 'positive' THEN ca.id END) as positive_calls,
                    COUNT(DISTINCT CASE WHEN ca.sentiment = 'negative' THEN ca.id END) as negative_calls,
                    COUNT(DISTINCT CASE WHEN ca.sentiment = 'neutral' THEN ca.id END) as neutral_calls
                FROM call_analysis ca
                JOIN call_transcriptions ct ON ca.id = ct.call_id
                WHERE ca.processed_at BETWEEN $1 AND $2
            ),
            top_tags AS (
                SELECT 
                    td.tag_name,
                    td.priority,
                    COUNT(ct.id) as count
                FROM call_tags ct
                JOIN tag_definitions td ON ct.tag_id = td.id
                JOIN call_analysis ca ON ct.call_id = ca.id
                WHERE ca.processed_at BETWEEN $1 AND $2
                GROUP BY td.tag_name, td.priority
                ORDER BY count DESC
                LIMIT 10
            )
            SELECT 
                (SELECT row_to_json(daily_stats) FROM daily_stats) as stats,
                (SELECT json_agg(row_to_json(top_tags)) FROM top_tags) as top_tags`;
        
        const result = await db.queryOne(summaryQuery, [startOfDay.toISOString(), endOfDay.toISOString()]);
        
        const summary = {
            date: format(date, 'yyyy-MM-dd'),
            generated_at: new Date().toISOString(),
            statistics: result.stats,
            top_tags: result.top_tags
        };
        
        fs.writeFileSync(outputPath, JSON.stringify(summary, null, 2));
        logger.info(`Exported daily summary for ${format(date, 'yyyy-MM-dd')} to ${outputPath}`);
        return summary;
    }
};

// CLI interface
const runExport = async () => {
    const args = process.argv.slice(2);
    
    if (args.length === 0) {
        console.log(`
Call Tagging Service - Data Export Utility

Usage:
  node dataExporter.js <command> [options]

Commands:
  analysis <startDate> <endDate> [outputPath]
    Export call analysis to CSV
    
  tags <startDate> <endDate> [outputPath]
    Export tag frequency report to JSON
    
  priority [limit] [outputPath]
    Export high-priority calls for review
    
  daily <date> [outputPath]
    Generate daily summary report

Examples:
  node dataExporter.js analysis 2024-01-01 2024-01-31
  node dataExporter.js tags 2024-01-01 2024-01-31 ./reports/tags.json
  node dataExporter.js priority 50 ./reports/high-priority.json
  node dataExporter.js daily 2024-01-15 ./reports/daily-2024-01-15.json
        `);
        process.exit(0);
    }
    
    await db.initDatabase();
    
    try {
        const command = args[0];
        const exportDir = path.resolve('./exports');
        
        // Create export directory if it doesn't exist
        if (!fs.existsSync(exportDir)) {
            fs.mkdirSync(exportDir, { recursive: true });
        }
        
        switch (command) {
            case 'analysis': {
                const startDate = args[1] || new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
                const endDate = args[2] || new Date().toISOString();
                const outputPath = args[3] || path.join(exportDir, `analysis-${Date.now()}.csv`);
                
                await exporters.exportCallAnalysisCSV(startDate, endDate, outputPath);
                console.log(`✓ Export complete: ${outputPath}`);
                break;
            }
            
            case 'tags': {
                const startDate = args[1] || new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
                const endDate = args[2] || new Date().toISOString();
                const outputPath = args[3] || path.join(exportDir, `tags-${Date.now()}.json`);
                
                await exporters.exportTagFrequencyReport(startDate, endDate, outputPath);
                console.log(`✓ Export complete: ${outputPath}`);
                break;
            }
            
            case 'priority': {
                const limit = parseInt(args[1]) || 100;
                const outputPath = args[2] || path.join(exportDir, `priority-${Date.now()}.json`);
                
                await exporters.exportHighPriorityCalls(outputPath, limit);
                console.log(`✓ Export complete: ${outputPath}`);
                break;
            }
            
            case 'daily': {
                const date = args[1] ? new Date(args[1]) : new Date();
                const outputPath = args[2] || path.join(exportDir, `daily-${format(date, 'yyyy-MM-dd')}.json`);
                
                await exporters.exportDailySummary(date, outputPath);
                console.log(`✓ Export complete: ${outputPath}`);
                break;
            }
            
            default:
                console.error(`Unknown command: ${command}`);
                process.exit(1);
        }
    } catch (error) {
        logger.error('Export error:', error);
        console.error(`Export failed: ${error.message}`);
        process.exit(1);
    } finally {
        await db.closeDatabase();
    }
};

// Run if called directly
if (process.argv[1] === fileURLToPath(import.meta.url)) {
    runExport();
}

export default exporters;
