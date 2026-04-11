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

    const club = auction.club as { name?: string; area?: string; thumbnail_url?: string | null } | null;

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

    // 기본: 인스타그램/기타용 1080x1920 세로형 이미지 (Premium Digital Ticket Style)
    const photoUrl = auction.thumbnail_url || club?.thumbnail_url || null;
    const isInstant = auction.listing_type === 'instant';

    return new ImageResponse(
      (
        <div
          style={{
            height: '100%',
            width: '100%',
            display: 'flex',
            flexDirection: 'column',
            backgroundColor: '#050505',
            color: 'white',
            fontFamily: 'Pretendard',
            position: 'relative',
          }}
        >
          {/* 1. 풀 스크린 배경 이미지 (Full-bleed Photo) */}
          {photoUrl && (
            <img
              src={photoUrl}
              style={{
                position: 'absolute',
                top: 0,
                left: 0,
                width: '100%',
                height: '100%',
                objectFit: 'cover',
                opacity: 0.7,
              }}
            />
          )}

          {/* 2. 다크 그라데이션 오버레이 (가독성 확보) */}
          <div
            style={{
              position: 'absolute',
              top: 0,
              left: 0,
              width: '100%',
              height: '100%',
              background: 'linear-gradient(to top, rgba(0,0,0,0.95) 0%, rgba(0,0,0,0.5) 40%, rgba(0,0,0,0.6) 100%)',
              display: 'flex',
            }}
          />

          {/* 3. 상단 브랜딩 & 상태 배지 (Glassmorphism Header) */}
          <div
            style={{
              padding: '80px 60px 0',
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              zIndex: 10,
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '32px', fontWeight: 'bold' }}>
              <span style={{ color: isInstant ? '#F59E0B' : '#4ADE80' }}>Night</span>
              <span>Flow</span>
            </div>
            <div
              style={{
                backgroundColor: isInstant ? 'rgba(245, 158, 11, 0.2)' : 'rgba(74, 222, 128, 0.2)',
                border: `1px solid ${isInstant ? 'rgba(245, 158, 11, 0.4)' : 'rgba(74, 222, 128, 0.4)'}`,
                padding: '10px 24px',
                borderRadius: '100px',
                fontSize: '20px',
                fontWeight: 'bold',
                color: isInstant ? '#F59E0B' : '#4ADE80',
                display: 'flex',
              }}
            >
              {isInstant ? '● FLASH DEAL' : '● BIDDING OPEN'}
            </div>
          </div>

          {/* 4. 중앙 메인 티켓 영역 (Ticket Body) */}
          <div
            style={{
              flex: 1,
              display: 'flex',
              flexDirection: 'column',
              justifyContent: 'center',
              padding: '0 60px',
              zIndex: 10,
            }}
          >
            {/* 지역 & 클럽명 */}
            <div style={{ fontSize: '24px', color: 'rgba(255,255,255,0.6)', marginBottom: '16px', display: 'flex' }}>
              {club?.area || 'SEOUL'}
            </div>
            <div
              style={{
                fontSize: '110px',
                fontWeight: 'black',
                lineHeight: 1,
                marginBottom: '40px',
                display: 'flex',
                letterSpacing: '-4px',
                textTransform: 'uppercase',
              }}
            >
              {club?.name || 'CLUB'}
            </div>

            {/* 테이블 정보 (Glassmorphism 스타일) */}
            <div
              style={{
                backgroundColor: 'rgba(255,255,255,0.08)',
                backdropFilter: 'blur(20px)',
                borderRadius: '40px',
                padding: '48px',
                border: '1px solid rgba(255,255,255,0.12)',
                display: 'flex',
                flexDirection: 'column',
                gap: '32px',
              }}
            >
              <div style={{ display: 'flex', flexDirection: 'column' }}>
                <div style={{ fontSize: '20px', color: 'rgba(255,255,255,0.5)', marginBottom: '6px', display: 'flex' }}>LOCATION</div>
                <div style={{ fontSize: '48px', fontWeight: 'bold', display: 'flex' }}>{auction.table_info}</div>
              </div>

              <div style={{ display: 'flex', flexDirection: 'column' }}>
                <div style={{ fontSize: '20px', color: 'rgba(255,255,255,0.5)', marginBottom: '6px', display: 'flex' }}>DATE</div>
                <div style={{ fontSize: '48px', fontWeight: 'bold', display: 'flex' }}>
                  {dayjs(auction.event_date).locale('ko').format('M월 D일 (dd)')}
                </div>
              </div>

              {/* 가격 섹션 (강조) */}
              <div
                style={{
                  marginTop: '16px',
                  paddingTop: '32px',
                  borderTop: '1px dashed rgba(255,255,255,0.2)',
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'flex-end',
                }}
              >
                <div style={{ display: 'flex', flexDirection: 'column' }}>
                  <div style={{ fontSize: '20px', color: 'rgba(255,255,255,0.5)', marginBottom: '4px', display: 'flex' }}>
                    {isInstant ? 'PRICE' : 'START PRICE'}
                  </div>
                  <div
                    style={{
                      fontSize: '72px',
                      fontWeight: 'black',
                      color: isInstant ? '#F59E0B' : '#4ADE80',
                      display: 'flex',
                    }}
                  >
                    ₩{auction.start_price.toLocaleString()}
                  </div>
                </div>
                <div style={{ marginBottom: '14px', fontSize: '24px', fontWeight: 'bold', color: 'rgba(255,255,255,0.4)', display: 'flex' }}>
                  #{auction.id.slice(0, 6).toUpperCase()}
                </div>
              </div>
            </div>
          </div>

          {/* 5. 푸터 (CTA & Guide) */}
          <div
            style={{
              padding: '0 60px 80px',
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              gap: '24px',
              zIndex: 10,
            }}
          >
            <div
              style={{
                width: '100%',
                padding: '24px',
                backgroundColor: isInstant ? '#F59E0B' : '#4ADE80',
                color: 'black',
                borderRadius: '100px',
                fontSize: '32px',
                fontWeight: 'bold',
                display: 'flex',
                justifyContent: 'center',
                alignItems: 'center',
              }}
            >
              LINK IN STORY →
            </div>
            <div style={{ fontSize: '20px', color: 'rgba(255,255,255,0.4)', display: 'flex', textAlign: 'center' }}>
              @NightFlow.co · 공식 티켓 인증 완료
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
