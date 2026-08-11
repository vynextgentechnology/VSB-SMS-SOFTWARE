/**
 * Centralized logger and error handling utility for capturing client-side and API error details.
 * Useful for debugging Vercel serverless function failures, network issues, and backend response errors.
 */

export interface ErrorLogDetails {
  timestamp: string;
  source: 'client' | 'api' | 'serverless';
  message: string;
  statusCode?: number;
  url?: string;
  responseData?: any;
  stack?: string;
}

class Logger {
  private logs: ErrorLogDetails[] = [];
  private maxLogs = 50;

  public logError(error: any, context?: { source?: 'client' | 'api' | 'serverless'; url?: string }): ErrorLogDetails {
    const timestamp = new Date().toISOString();
    let message = 'An unexpected error occurred';
    let statusCode: number | undefined = undefined;
    let responseData: any = undefined;
    let stack: string | undefined = undefined;

    if (typeof error === 'string') {
      message = error;
    } else if (error && typeof error === 'object') {
      if (error.message) {
        message = error.message;
      }

      if (error.response) {
        statusCode = error.response.status || error.status;
        responseData = error.response.data || error.data;
      } else if (error.status) {
        statusCode = error.status;
      }

      if (error.stack) {
        stack = error.stack;
      }

      // Check if response body contained an error object
      if (responseData && typeof responseData === 'object') {
        if (responseData.message) {
          message = responseData.message;
        } else if (responseData.error) {
          message = typeof responseData.error === 'string' ? responseData.error : JSON.stringify(responseData.error);
        }
      }
    }

    const logEntry: ErrorLogDetails = {
      timestamp,
      source: context?.source || 'client',
      message,
      statusCode,
      url: context?.url || (typeof window !== 'undefined' ? window.location.href : undefined),
      responseData,
      stack,
    };

    console.error(`[${logEntry.source.toUpperCase()} ERROR] ${logEntry.timestamp}:`, message, {
      statusCode,
      url: logEntry.url,
      responseData,
      errorObj: error,
    });

    this.logs.unshift(logEntry);
    if (this.logs.length > this.maxLogs) {
      this.logs.pop();
    }

    return logEntry;
  }

  public getLogs(): ErrorLogDetails[] {
    return [...this.logs];
  }

  public clearLogs() {
    this.logs = [];
  }
}

export const logger = new Logger();

/**
 * Format error message safely into readable string
 */
export function formatError(err: any): string {
  if (!err) return 'Unknown error';
  if (typeof err === 'string') return err;
  if (err.response?.data?.message) return err.response.data.message;
  if (err.response?.data?.error) {
    const e = err.response.data.error;
    return typeof e === 'string' ? e : e.message || JSON.stringify(e);
  }
  if (err.message) return err.message;
  return 'A server or network error occurred';
}
