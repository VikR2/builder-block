import { NextResponse } from 'next/server';

function unavailableResponse() {
  return NextResponse.json(
    { error: 'Study guides are temporarily unavailable' },
    { status: 404 }
  );
}

export async function GET() {
  return unavailableResponse();
}

export async function POST() {
  return unavailableResponse();
}

export async function DELETE() {
  return unavailableResponse();
}
