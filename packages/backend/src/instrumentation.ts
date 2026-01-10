import { NodeSDK } from '@opentelemetry/sdk-node';
import { OTLPLogExporter } from '@opentelemetry/exporter-logs-otlp-http';
import { BatchLogRecordProcessor } from '@opentelemetry/sdk-logs';
import { getNodeAutoInstrumentations } from '@opentelemetry/auto-instrumentations-node';

// Set service name via env var (handled by SDK/Resources automatically)
process.env.OTEL_SERVICE_NAME = process.env.OTEL_SERVICE_NAME || 'dotor-backend';
process.env.OTEL_RESOURCE_ATTRIBUTES = process.env.OTEL_RESOURCE_ATTRIBUTES || 'service.version=1.0.0';

// Configure the SDK
const sdk = new NodeSDK({
    // resource detected automatically from env
    logRecordProcessor: new BatchLogRecordProcessor(
        new OTLPLogExporter({
            url: process.env.OTEL_EXPORTER_OTLP_LOGS_ENDPOINT || 'https://us.i.posthog.com/api/v1/log',
            headers: {
                'Authorization': `Bearer ${process.env.POSTHOG_API_KEY}`
            }
        })
    ),
    instrumentations: [getNodeAutoInstrumentations()],
});

// Initialize the SDK
sdk.start();

console.log('OpenTelemetry SDK started');

// Graceful shutdown
process.on('SIGTERM', () => {
    sdk.shutdown()
        .then(() => console.log('OpenTelemetry SDK terminated'))
        .catch((error) => console.log('Error terminating OpenTelemetry SDK', error))
        .finally(() => process.exit(0));
});
