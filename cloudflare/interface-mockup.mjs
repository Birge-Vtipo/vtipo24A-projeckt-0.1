export const mockupStyles = `
.mockup-intro { max-width:56ch; color:var(--muted); margin:-12px 0 28px }
.mockup-board {
  padding:clamp(14px,2.6vw,40px); border:1px solid #655775; border-radius:4px;
  background-color:#211c2d;
  background-image:radial-gradient(#71627d80 .8px,transparent .9px); background-size:12px 12px;
}
.mockup-key,.mockup-caption { font:600 11px/1.5 monospace; letter-spacing:.06em }
.mockup-key { display:flex; align-items:center; gap:10px; margin:0 0 22px; color:#e8dfef }
.mockup-swatches { display:flex; gap:3px }
.mockup-swatches i { width:12px; height:12px; border-radius:50%; background:#d9c8f0 }
.mockup-swatches i:nth-child(2) { background:#e6c77f }
.mockup-swatches i:last-child { background:#faf4e8 }
.mockup-flow { display:grid; grid-template-columns:repeat(3,minmax(0,1fr)); gap:clamp(12px,2vw,30px); }
.mockup-frame { margin:0; min-width:0; display:flex; flex-direction:column }
.mockup-screen {
  flex:1; display:flex; flex-direction:column; overflow:hidden; border:1px solid #ffffff36;
  border-radius:20px; background:#181421; color:#f9f5ee; box-shadow:0 8px 14px #100a172b;
}
.mockup-chrome { display:flex; align-items:center; justify-content:space-between; gap:8px; padding:12px 17px; border-bottom:1px solid #ffffff26 }
.mockup-brand { font-size:17px; font-weight:800; line-height:1.2; letter-spacing:-.06em }
.mockup-brand i { color:#e6c77f }
.mockup-chrome small,.mockup-kicker,.mockup-meta { font:600 11px/1.5 'Segoe UI',sans-serif; letter-spacing:.035em }
.mockup-chrome small,.mockup-meta { color:#c4b9cf }
.mockup-body { display:grid; align-content:start; gap:12px; padding:16px; flex:1 }
.mockup-body h3 { font-size:clamp(19px,1.7vw,26px); line-height:1.15; letter-spacing:-.04em; margin:0 }
.mockup-body p,.mockup-caption { margin:0 }
.mockup-cover { display:block; width:100%; height:88px }
.mockup-listing { padding:12px; background:#eee5f6; color:#281c38; border-radius:12px }
.mockup-listing strong { display:block; font-size:17px; line-height:1.25; margin:4px 0 }
.mockup-listing p,.mockup-bio { font-size:13px; line-height:1.5 }
.mockup-nav { display:flex; justify-content:space-around; gap:4px; padding:10px 5px; border-top:1px solid #ffffff26; color:#bfb4ca; font:600 11px/1.4 'Segoe UI',sans-serif }
.mockup-nav b { color:#f2d38a }
.mockup-chat { background:#e7dbf1; color:#271b34 }
.mockup-chat .mockup-chrome { border-color:#29163526 }
.mockup-chat .mockup-chrome small,.mockup-chat .mockup-meta { color:#60556e }
.mockup-chat .mockup-brand i { color:#76538d }
.mockup-bubble { max-width:91%; padding:9px 12px; border-radius:14px 14px 14px 3px; background:#fffaf4; color:#32253f; font-size:14px; line-height:1.4 }
.mockup-bubble.outgoing { justify-self:end; background:#503663; color:white; border-radius:14px 14px 3px 14px }
.mockup-compose { margin:0 14px 12px; padding:8px 12px; border:1px solid #84758d; border-radius:20px; color:#5d5069; font-size:12px }
.mockup-profile { background:#272134 }
.mockup-profile .mockup-cover { height:72px }
.mockup-profile .mockup-body { padding-top:0; gap:7px }
.mockup-monogram { position:relative; width:49px; height:49px; margin-top:-18px; border:3px solid #272134; border-radius:50%; display:grid; place-items:center; background:#e7c77d; color:#37263c; font:700 16px/1 monospace }
.mockup-tags { display:flex; gap:5px; flex-wrap:wrap }
.mockup-tags span { border:1px solid #ffffff38; border-radius:20px; padding:2px 8px; font-size:11px }
.mockup-caption { margin:12px 0 0; color:#e4d9ee }
.mockup-caption b { color:var(--gold); margin-right:6px }
@media(max-width:960px) {
  .mockup-flow { grid-template-columns:minmax(0,1fr); gap:26px; max-width:440px; margin:auto }
  .mockup-screen { border-radius:16px }
}
`;

export const mockupSection = `
<section class="section" id="ui-ux" aria-labelledby="mockup-title">
  <div class="section-heading"><span class="section-number">02 /</span><h2 id="mockup-title">UI/UX <span>макеті.</span></h2></div>
  <p class="mockup-intro">Бір кездесудің үш экраны. Мына үлгіде Айша кітап алмасуды ұсынады, Дана оған чатта жауап береді.</p>
  <div class="mockup-board">
    <p class="mockup-key"><span class="mockup-swatches" aria-hidden="true"><i></i><i></i><i></i></span> BIRGE / ЭКРАН ҮЛГІЛЕРІ</p>
    <div class="mockup-flow">
      <figure class="mockup-frame">
        <div class="mockup-screen">
          <div class="mockup-chrome"><span class="mockup-brand">Birge<i>.</i></span><small>Басты бет</small></div>
          <div class="mockup-body">
            <h3>Жарияланымдар</h3>
            <svg class="mockup-cover" viewBox="0 0 280 88" preserveAspectRatio="xMidYMid slice" aria-hidden="true" focusable="false">
              <rect width="280" height="88" rx="9" fill="#e5c77f"/>
              <circle cx="231" cy="23" r="34" fill="#f9e9be"/>
              <g transform="translate(69 51) rotate(-11)" stroke="#2d2038" stroke-width="2" stroke-linejoin="round">
                <path d="M-23-23Q4-28 30-13Q57-25 83-16L83 20Q58 13 30 24Q4 11-23 15Z" fill="#ad8cc5"/>
                <path d="M-19-28Q6-29 30-15Q55-29 79-22L79 13Q56 9 30 21Q4 7-19 10Z" fill="#fff5da"/>
                <path d="M30-15V21M-12-15Q3-16 20-8M42-9Q55-15 70-13" fill="none"/>
              </g>
            </svg>
            <div class="mockup-listing"><small class="mockup-kicker">КІТАП АЛМАСУ</small><strong>Бір кітапқа бір кітап</strong><p>Бүгін кітапханада оқыған кітаптарымызды алмастырайық.</p></div>
            <small class="mockup-meta">Айша · 14:10</small>
          </div>
          <div class="mockup-nav"><b>Лента</b><span>Чат</span><span>Профиль</span></div>
        </div>
        <figcaption class="mockup-caption"><b>01</b> Ұсынысты табу</figcaption>
      </figure>
      <figure class="mockup-frame">
        <div class="mockup-screen mockup-chat">
          <div class="mockup-chrome"><span class="mockup-brand">Birge<i>.</i></span><small>Жеке чат</small></div>
          <div class="mockup-body">
            <h3>Айша</h3><small class="mockup-meta">Бүгін · 14:18</small>
            <p class="mockup-bubble outgoing">Сәлем, Айша! Кітап алмасуға келсем бола ма?</p>
            <p class="mockup-bubble">Әрине! Сағат үште кітапханада кездесеміз.</p>
            <p class="mockup-bubble outgoing">Келістік!</p>
          </div>
          <div class="mockup-compose">Хабарлама жазу…</div>
        </div>
        <figcaption class="mockup-caption"><b>02</b> Кездесуді келісу</figcaption>
      </figure>
      <figure class="mockup-frame">
        <div class="mockup-screen mockup-profile">
          <div class="mockup-chrome"><span class="mockup-brand">Birge<i>.</i></span><small>Профиль</small></div>
          <svg class="mockup-cover" viewBox="0 0 280 72" preserveAspectRatio="xMidYMid slice" aria-hidden="true" focusable="false">
            <rect width="280" height="72" fill="#b69acb"/><circle cx="196" cy="27" r="17" fill="#f4db9c"/>
            <path d="M0 51Q48 17 104 37T211 34T280 32V72H0Z" fill="#83648f"/>
            <path d="M0 56Q58 79 124 50T238 47T280 53V72H0Z" fill="#54405e"/>
            <path d="M0 67Q65 44 131 64T250 58T280 62V72H0Z" fill="#362c44"/>
          </svg>
          <div class="mockup-body">
            <span class="mockup-monogram" aria-hidden="true">АС</span>
            <h3>Айша Сәрсен</h3><small class="mockup-meta">@aisha_books</small>
            <p class="mockup-bio">Астанада оқимын. Жақсы кітапты оқып болған соң, біреумен бөліскенді ұнатамын.</p>
            <div class="mockup-tags"><span>Кітаптар</span><span>Астана</span></div>
          </div>
          <div class="mockup-nav"><span>Лента</span><span>Чат</span><b>Профиль</b></div>
        </div>
        <figcaption class="mockup-caption"><b>03</b> Автормен танысу</figcaption>
      </figure>
    </div>
  </div>
</section>`;
