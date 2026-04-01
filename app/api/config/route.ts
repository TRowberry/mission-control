import { NextResponse } from 'next/server';

// Public config endpoint - returns non-sensitive configuration
export async function GET() {
  return NextResponse.json({
    registrationEnabled: process.env.REGISTRATION_DISABLED !== 'true',
  });
}
