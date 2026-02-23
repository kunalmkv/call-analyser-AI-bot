/**
 * Parse a single CSV line respecting double-quoted fields (with possible commas inside).
 * Does not handle newlines inside quoted fields.
 * @param {string} line
 * @returns {string[]}
 */
export function parseCSVLine(line) {
    const result = [];
    let i = 0;
    while (i < line.length) {
        if (line[i] === '"') {
            i++;
            let field = '';
            while (i < line.length) {
                if (line[i] === '"') {
                    i++;
                    if (line[i] === '"') {
                        field += '"';
                        i++;
                    } else {
                        break;
                    }
                } else {
                    field += line[i];
                    i++;
                }
            }
            result.push(field);
            if (i < line.length && line[i] === ',') i++;
        } else {
            let field = '';
            while (i < line.length && line[i] !== ',') {
                field += line[i];
                i++;
            }
            result.push(field.trim());
            if (i < line.length && line[i] === ',') i++;
        }
    }
    return result;
}
