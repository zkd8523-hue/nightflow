import { ImageResponse } from 'next/og';
import { createAdminClient } from '@/lib/supabase/admin';
import dayjs from 'dayjs';
import 'dayjs/locale/ko';

export const runtime = 'edge';

// Font loading helper
async function loadFont() {
  const response = await fetch(
    new URL('https://cdn.jsdelivr.net/gh/orioncactus/pretendard@v1.3.9/packages/pretendard/dist/web/static/Pretendard-Bold.otf', 'https://nightflow.com')
  );
  return response.arrayBuffer();
}

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  try {
    const supabase = createAdminClient();
    const { data: auction, error } = await supabase
      .from('auctions')
      .select(`
                *,
                club:clubs (
                    name,
                    area
                )
            `)
      .eq('id', id)
      .single();

    if (error || !auction) {
      console.error('Auction fetch error:', error);
      return new Response('Auction not found', { status: 404 });
    }

    const fontData = await loadFont();

    const club = auction.club as any;

    return new ImageResponse(
      (
        <div
          style={{
            height: '100%',
            width: '100%',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            backgroundColor: '#0A0A0A',
            color: 'white',
            fontFamily: 'Pretendard',
            padding: '260px 80px',
            position: 'relative',
          }}
        >
          {/* Background Decoration */}
          <div style={{
            position: 'absolute',
            top: '-100px',
            right: '-100px',
            width: '800px',
            height: '800px',
            background: 'radial-gradient(circle, rgba(74, 222, 128, 0.12) 0%, transparent 70%)',
            borderRadius: '50%',
            display: 'flex',
          }} />

          <div style={{
            position: 'absolute',
            bottom: '-150px',
            left: '-150px',
            width: '1000px',
            height: '1000px',
            background: 'radial-gradient(circle, rgba(236, 72, 153, 0.08) 0%, transparent 70%)',
            borderRadius: '50%',
            display: 'flex',
          }} />

          {/* Header Branding */}
          <div style={{
            display: 'flex',
            alignItems: 'center',
            gap: '12px',
            marginBottom: '60px',
            fontSize: '56px',
            fontWeight: 'bold',
            letterSpacing: '-2px',
          }}>
            <span style={{ color: '#4ADE80' }}>Night</span>
            <span>Flow</span>
          </div>

          {/* Main Card */}
          <div style={{
            width: '100%',
            display: 'flex',
            flexDirection: 'column',
            backgroundColor: '#1C1C21',
            borderRadius: '64px',
            padding: '80px',
            border: '1px solid #333',
            boxShadow: '0 40px 100px rgba(0,0,0,0.8)',
          }}>
            <div style={{ fontSize: '36px', color: '#888', marginBottom: '20px', display: 'flex' }}>
              {club?.area || 'SEOUL'}
            </div>
            <div style={{ fontSize: '84px', fontWeight: 'bold', marginBottom: '48px', lineHeight: 1.1, display: 'flex' }}>
              {club?.name || 'CLUB NAME'}
            </div>

            <div style={{ height: '6px', width: '100px', backgroundColor: '#4ADE80', marginBottom: '60px', display: 'flex' }} />

            <div style={{ display: 'flex', flexDirection: 'column', gap: '40px' }}>
              <div style={{ display: 'flex', flexDirection: 'column' }}>
                <div style={{ fontSize: '32px', color: '#888', marginBottom: '12px', display: 'flex' }}>테이블 정보</div>
                <div style={{ fontSize: '64px', fontWeight: 'bold', display: 'flex' }}>{auction.table_info}</div>
              </div>

              <div style={{ display: 'flex', flexDirection: 'column' }}>
                <div style={{ fontSize: '32px', color: '#888', marginBottom: '12px', display: 'flex' }}>날짜</div>
                <div style={{ fontSize: '64px', fontWeight: 'bold', display: 'flex' }}>
                  {dayjs(auction.event_date).locale('ko').format('YYYY년 MM월 DD일')}
                </div>
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', marginTop: '40px', borderTop: '1px solid #333', paddingTop: '40px' }}>
                <div style={{ fontSize: '32px', color: '#888', marginBottom: '12px', display: 'flex' }}>시작가</div>
                <div style={{ fontSize: '100px', fontWeight: 'bold', color: '#4ADE80', display: 'flex' }}>
                  ₩{auction.start_price.toLocaleString()}
                </div>
              </div>
            </div>
          </div>

          {/* Footer CTA */}
          <div style={{
            marginTop: '60px',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            gap: '30px',
          }}>
            <div style={{
              padding: '32px 80px',
              backgroundColor: '#4ADE80',
              color: 'black',
              borderRadius: '100px',
              fontSize: '48px',
              fontWeight: 'bold',
              display: 'flex',
            }}>
              지금 입찰하기 →
            </div>
            <div style={{ fontSize: '32px', color: '#666', marginTop: '20px', display: 'flex' }}>
              밤의 흐름을 바꾸는 최고의 테이블 경매, 나이트플로우
            </div>
          </div>
        </div>
      ),
      {
        width: 1080,
        height: 1920,
        fonts: [
          {
            name: 'Pretendard',
            data: fontData,
            style: 'normal',
          },
        ],
      }
    );
  } catch (e) {
    console.error('OG Image Generation Error:', e);
    return new Response('Failed to generate image', { status: 500 });
  }
}
