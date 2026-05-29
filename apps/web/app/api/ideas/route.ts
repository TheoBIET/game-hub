import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import { auth } from '@/lib/auth';
import { getDb } from '@tabswitch/db';
import { looksAbusive, slugify } from '@/lib/moderation';

const CreateIdeaSchema = z.object({
  title: z.string().trim().min(4, 'Titre trop court').max(120, 'Titre trop long'),
  body: z.string().trim().min(10, 'Décris ton idée (10 chars min)').max(2000),
});

export async function GET(req: NextRequest) {
  const url = req.nextUrl;
  const sort = url.searchParams.get('sort') === 'new' ? 'new' : 'top';
  const limit = Math.min(50, Math.max(1, Number(url.searchParams.get('limit') ?? '30') | 0));

  // Graceful degradation when DATABASE_URL is absent (lazy proxy throws on
  // first access). Lets the homepage / games keep working in a DB-less dev.
  try {
    const db = getDb();

    const rows = await db.idea.findMany({
      where: { hidden: false },
      orderBy: sort === 'new' ? { createdAt: 'desc' } : { voteCount: 'desc' },
      take: limit,
      include: {
        author: { select: { id: true, name: true, nickname: true } },
      },
    });

    let meId: string | undefined;
    try {
      const session = await auth();
      meId = (session?.user as { id?: string } | undefined)?.id;
    } catch {
      meId = undefined;
    }
    const votedIds = meId
      ? new Set(
          (
            await db.ideaVote.findMany({
              where: { userId: meId },
              select: { ideaId: true },
            })
          ).map((v) => v.ideaId),
        )
      : new Set<string>();

    return NextResponse.json({
      ideas: rows.map((r) => ({
        id: r.id,
        title: r.title,
        body: r.body,
        status: r.status,
        voteCount: r.voteCount,
        createdAt: r.createdAt,
        author: { name: r.author?.nickname ?? r.author?.name ?? 'Anonyme' },
        mine: meId === r.authorId,
        voted: votedIds.has(r.id),
      })),
    });
  } catch {
    return NextResponse.json({ ideas: [], dbUnavailable: true });
  }
}

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

  const parsed = CreateIdeaSchema.safeParse(payload);
  if (!parsed.success) {
    return NextResponse.json(
      { ok: false, error: parsed.error.issues[0]?.message ?? 'Données invalides' },
      { status: 400 },
    );
  }
  if (looksAbusive(parsed.data.title + ' ' + parsed.data.body)) {
    return NextResponse.json({ ok: false, error: 'Contenu refusé.' }, { status: 400 });
  }

  const db = getDb();
  const slug = slugify(parsed.data.title).slice(0, 140);

  try {
    const inserted = await db.idea.create({
      data: {
        authorId: userId,
        title: parsed.data.title,
        body: parsed.data.body,
        slug,
      },
      select: { id: true },
    });
    return NextResponse.json({ ok: true, id: inserted.id });
  } catch (e) {
    const msg = (e as Error)?.message ?? '';
    if (msg.includes('ideas_author_slug_uniq')) {
      return NextResponse.json(
        { ok: false, error: 'Tu as déjà proposé une idée avec ce titre.' },
        { status: 409 },
      );
    }
    return NextResponse.json({ ok: false, error: 'Erreur serveur.' }, { status: 500 });
  }
}

export async function PATCH(req: NextRequest) {
  // Vote / unvote toggle. Body: { id: string, vote: boolean }
  const session = await auth();
  const userId = (session?.user as { id?: string } | undefined)?.id;
  if (!userId) {
    return NextResponse.json({ ok: false, error: 'Connecte-toi pour voter.' }, { status: 401 });
  }

  const body = (await req.json().catch(() => null)) as { id?: string; vote?: boolean } | null;
  if (!body?.id || typeof body.vote !== 'boolean') {
    return NextResponse.json({ ok: false, error: 'Payload invalide' }, { status: 400 });
  }

  const db = getDb();

  if (body.vote) {
    await db.ideaVote.upsert({
      where: { ideaId_userId: { ideaId: body.id, userId } },
      create: { ideaId: body.id, userId },
      update: {},
    });
  } else {
    await db.ideaVote.deleteMany({ where: { ideaId: body.id, userId } });
  }

  const count = await db.ideaVote.count({ where: { ideaId: body.id } });
  await db.idea.update({ where: { id: body.id }, data: { voteCount: count } });

  return NextResponse.json({ ok: true, voteCount: count });
}
