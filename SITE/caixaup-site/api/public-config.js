export function GET() {
  return Response.json({
    supabaseUrl: process.env.SUPABASE_URL || '',
    supabasePublishableKey: process.env.SUPABASE_PUBLISHABLE_KEY || '',
    appUrl: process.env.APP_URL || 'https://app.caixaup.com.br',
    downloadEndpoint: '/api/download-app',
    downloadUrl: 'https://github.com/thalleseduardo1450-bot/CaixaUp/releases/download/v3.3.24/CaixaUp-Setup-3.3.24.exe'
  }, {
    headers: { 'Cache-Control': 'no-store' }
  });
}
