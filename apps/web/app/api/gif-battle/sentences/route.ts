import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import { auth } from '@/lib/auth';
import { getDb } from '@tabswitch/db';
import { looksAbusive } from '@/lib/moderation';

const CreateSentenceSchema = z.object({
  sentenceFr: z.string().trim().min(4, 'Phrase FR trop courte').max(140, 'Phrase FR trop longue'),
  sentenceEn: z.string().trim().min(4, 'Phrase EN trop courte').max(140, 'Phrase EN trop longue'),
});

export async function POST(req: NextRequest) {
  const session = await auth();
  const userId = (session?.user as { id?: string } | undefined)?.id;
  if (!userId) {
    return NextResponse.json({ ok: false, error: 'Connecte-toi pour proposer.' }, { status: 401 });
  }

  let payload: unknown;
  try {
    payload = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: 'JSON invalide' }, { status: 400 });
  }

  const parsed = CreateSentenceSchema.safeParse(payload);
  if (!parsed.success) {
    return NextResponse.json(
      { ok: false, error: parsed.error.issues[0]?.message ?? 'Données invalides' },
      { status: 400 },
    );
  }
  if (looksAbusive(parsed.data.sentenceFr + ' ' + parsed.data.sentenceEn)) {
    return NextResponse.json({ ok: false, error: 'Contenu refusé.' }, { status: 400 });
  }

  try {
    const db = getDb();
    const dup = await db.gifBattleSentence.findFirst({
      where: { sentenceFr: parsed.data.sentenceFr },
      select: { id: true },
    });
    if (dup) {
      return NextResponse.json({ ok: false, error: 'Cette phrase existe déjà.' }, { status: 409 });
    }
    const created = await db.gifBattleSentence.create({
      data: {
        sentenceFr: parsed.data.sentenceFr,
        sentenceEn: parsed.data.sentenceEn,
        isApproved: false,
        authorId: userId,
      },
      select: { id: true },
    });
    return NextResponse.json({ ok: true, id: created.id });
  } catch {
    return NextResponse.json({ ok: false, error: 'Erreur serveur.' }, { status: 500 });
  }
}
