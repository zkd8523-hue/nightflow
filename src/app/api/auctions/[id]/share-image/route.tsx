import { ImageResponse } from 'next/og';
import { createAdminClient } from '@/lib/supabase/admin';
import dayjs from 'dayjs';
import 'dayjs/locale/ko';

export const runtime = 'edge';

// Font loading helper
async function loadFont() {
  const response = await fetch(
    'https://cdn.jsdelivr.net/npm/pretendard@1.3.9/dist/public/static/Pretendard-Bold.otf'
  );
  return response.arrayBuffer();
}

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const { searchParams } = new URL(request.url);
  const format = searchParams.get('format');

  try {
    const supabase = createAdminClient();
    const { data: auction, error } = await supabase
      .from('auctions')
      .select(`
                *,
                club:clubs (
                    name,
                    area,
                    thumbnail_url
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

    // KakaoTalk용 1200x630 가로형 이미지
    if (format === 'kakao') {
      const photoUrl = auction.thumbnail_url || club?.thumbnail_url || null;

      return new ImageResponse(
        (
          <div
            style={{
              width: '100%',
              height: '100%',
              display: 'flex',
              position: 'relative',
              backgroundColor: '#0A0A0A',
              fontFamily: 'Pretendard',
            }}
          >
            {/* 배경 사진 */}
            {photoUrl ? (
              <img
                src={photoUrl}
                style={{
                  position: 'absolute',
                  top: 0,
                  left: 0,
                  width: '100%',
                  height: '100%',
                  objectFit: 'cover',
                }}
              />
            ) : (
              <>
                <div style={{
                  position: 'absolute',
                  top: '-60px',
                  right: '-60px',
                  width: '500px',
                  height: '500px',
                  background: 'radial-gradient(circle, rgba(74, 222, 128, 0.15) 0%, transparent 70%)',
                  borderRadius: '50%',
                  display: 'flex',
                }} />
                <div style={{
                  position: 'absolute',
                  bottom: '-80px',
                  left: '-80px',
                  width: '600px',
                  height: '600px',
                  background: 'radial-gradient(circle, rgba(236, 72, 153, 0.1) 0%, transparent 70%)',
                  borderRadius: '50%',
                  display: 'flex',
                }} />
              </>
            )}

            {/* 다크 오버레이 */}
            <div
              style={{
                position: 'absolute',
                top: 0,
                left: 0,
                width: '100%',
                height: '100%',
                background: photoUrl
                  ? 'linear-gradient(to top, rgba(0,0,0,0.85) 0%, rgba(0,0,0,0.4) 50%, rgba(0,0,0,0.55) 100%)'
                  : 'transparent',
                display: 'flex',
              }}
            />

            {/* NightFlow 브랜딩 - 좌상단 */}
            <div
              style={{
                position: 'absolute',
                top: '32px',
                left: '40px',
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
                fontSize: '24px',
                fontWeight: 'bold',
                letterSpacing: '-1px',
                color: 'white',
                opacity: 0.9,
              }}
            >
              <span style={{ color: '#4ADE80' }}>Night</span>
              <span>Flow</span>
            </div>

            {/* 메인 콘텐츠 - 좌하단 */}
            <div
              style={{
                position: 'absolute',
                bottom: 0,
                left: 0,
                right: 0,
                padding: '0 40px 40px',
                display: 'flex',
                flexDirection: 'column',
                gap: '8px',
              }}
            >
              {/* 지역 태그 */}
              <div style={{ display: 'flex' }}>
                <div
                  style={{
                    fontSize: '16px',
                    color: 'rgba(255,255,255,0.6)',
                    backgroundColor: 'rgba(255,255,255,0.1)',
                    padding: '4px 12px',
                    borderRadius: '100px',
                    display: 'flex',
                  }}
                >
                  {club?.area || 'SEOUL'}
                </div>
              </div>

              {/* 클럽명 */}
              <div
                style={{
                  fontSize: '48px',
                  fontWeight: 'bold',
                  color: 'white',
                  lineHeight: 1.1,
                  display: 'flex',
                }}
              >
                {club?.name || 'CLUB'}
              </div>

              {/* 테이블 정보 + 날짜 */}
              <div
                style={{
                  fontSize: '20px',
                  color: 'rgba(255,255,255,0.7)',
                  display: 'flex',
                  gap: '8px',
                }}
              >
                <span>{auction.table_info}</span>
                <span style={{ color: 'rgba(255,255,255,0.3)' }}>·</span>
                <span>{dayjs(auction.event_date).locale('ko').format('M월 D일 (dd)')}</span>
              </div>

              {/* 구분선 + 시작가 */}
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  marginTop: '12px',
                  paddingTop: '16px',
                  borderTop: '1px solid rgba(255,255,255,0.15)',
                }}
              >
                <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
                  <div style={{ fontSize: '14px', color: 'rgba(255,255,255,0.5)', display: 'flex' }}>시작가</div>
                  <div style={{ fontSize: '36px', fontWeight: 'bold', color: '#4ADE80', display: 'flex' }}>
                    ₩{auction.start_price.toLocaleString()}
                  </div>
                </div>
                <div
                  style={{
                    padding: '12px 28px',
                    backgroundColor: '#4ADE80',
                    color: 'black',
                    borderRadius: '100px',
                    fontSize: '18px',
                    fontWeight: 'bold',
                    display: 'flex',
                  }}
                >
                  입찰하기
                </div>
              </div>
            </div>
          </div>
        ),
        {
          width: 1200,
          height: 630,
          fonts: [
            {
              name: 'Pretendard',
              data: fontData,
              style: 'normal',
            },
          ],
        }
      );
    }

    // 기본: 인스타그램/기타용 1080x1920 세로형 이미지
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
