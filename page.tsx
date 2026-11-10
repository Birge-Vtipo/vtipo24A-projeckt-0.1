:root {
  --rail: clamp(218px, 18.4vw, 280px);
  --pad: clamp(24px, 3vw, 48px);
  --bg: #f5f3fa;
  --surface: #fff;
  --ink: #211d3f;
  --muted: #78728b;
  --line: #e6e1f2;
  --soft: #eeeaf7;
  --primary: #393185;
  --accent: #393185;
}
:root.dark {
  --bg: #191728; --surface: #262237; --ink: #f5f1ff;
  --muted: #c5bdd7; --line: #433d58; --soft: #35304b; --accent: #c8bafa;
}
* { box-sizing: border-box; }
body { margin: 0; background: var(--bg); color: var(--ink); font: 16px/1.5 "Segoe UI", Arial, sans-serif; }
h1, h2, h3, p { margin: 0; }
h1, h2, h3, strong, b { line-height: 1.18; }
h1 { font-size: 36px; letter-spacing: -.035em; }
h2 { font-size: 29px; letter-spacing: -.025em; }
h3 { font-size: 20px; }
p { color: var(--muted); }
small { display: block; color: var(--muted); font-size: 13px; }
a { color: inherit; text-decoration: none; }
button, select, input, textarea { font: inherit; color: inherit; }
button { cursor: pointer; }
button:disabled { cursor: wait; opacity: .6; }
.button { border: 0; }
a:focus-visible, summary:focus-visible, button:focus-visible { outline: 3px solid #bb9248; outline-offset: 3px; }
svg { flex: none; stroke-width: 1.7; }
.brand, nav a, .button, .circle, .topbar, .tools, .location, .service, .quick, .symbol { display: flex; align-items: center; }
.brand { width: fit-content; gap: 12px; font-size: 40px; letter-spacing: -.065em; }
.brand span { color: #d2ae6d; }
.brand i { display: grid; place-items: center; width: 57px; height: 57px; border-radius: 15px; background: var(--primary); color: #ebd5ab; }
.brand svg { width: 31px; height: 31px; }
.rail { width: var(--rail); position: fixed; inset: 0 auto 0 0; z-index: 3; display: flex; flex-direction: column; padding: 30px clamp(16px, 2vw, 32px) 24px 15px; overflow-y: auto; background: var(--surface); border-right: 1px solid var(--line); }
.motto, .eyebrow { font-size: 13px; font-weight: 750; letter-spacing: .14em; }
.motto { color: var(--muted); margin: 54px 0 32px; }
nav { display: grid; gap: 6px; }
nav a { min-height: 64px; gap: 17px; padding: 10px 18px; border: 2px solid transparent; border-radius: 15px; color: var(--muted); }
nav a[aria-current] { background: var(--soft); border-color: var(--ink); font-weight: 700; color: var(--accent); }
nav a:hover, .service:hover { background: var(--soft); }
.button { width: fit-content; justify-content: center; gap: 12px; padding: 0 24px; min-height: 60px; font-weight: 700; border-radius: 15px; }
.primary { color: white; background: var(--primary); }
.rail > .button { width: 100%; margin: 32px 0 0; }
.trust { border-radius: 22px; background: var(--soft); padding: 23px; flex-shrink: 0; margin-top: max(64px, calc(100vh - 720px)); }
.trust svg { color: var(--accent); }
.trust strong, .trust small { display: block; margin-top: 11px; }
.topbar { margin-left: var(--rail); min-height: 100px; padding: 12px 2.2vw 12px 3.5vw; justify-content: space-between; background: var(--surface); border-bottom: 1px solid var(--line); }
.topbar .brand { display: none; }
.location, .tools { gap: 12px; }
.location svg { color: var(--accent); }
.location span { color: var(--muted); font-size: 14px; }
.language { font-size: 14px; padding: 0 8px; }
.circle { width: 52px; height: 52px; justify-content: center; border-radius: 50%; color: var(--muted); background: var(--surface); border: 1px solid var(--line); cursor: pointer; list-style: none; }
summary::-webkit-details-marker { display: none; }
.tools details { position: relative; }
.tools sup { position: absolute; top: -3px; right: -2px; width: 19px; border-radius: 50%; background: #d2ae6d; color: #30265e; font: bold 12px/19px Arial; text-align: center; }
.tools .primary { padding: 0 19px; min-height: 49px; gap: 7px; }
.popup { position: absolute; z-index: 2; top: 60px; right: 0; width: 240px; padding: 16px; background: var(--surface); border: 1px solid var(--line); border-radius: 14px; box-shadow: 0 9px 28px #19143818; }
.notices { width: min(330px,85vw); max-height: 380px; overflow-y: auto; }
.notices a { display: block; padding: 12px 0; border-bottom: 1px solid var(--line); }
.notices p { margin-top: 10px; font-size: 14px; }
.nav-count { background: var(--primary); color: white; border-radius: 20px; padding: 1px 7px; font-size: 11px; }
.connection-error { margin-left: var(--rail); display: flex; flex-wrap: wrap; gap: 12px; padding: 12px var(--pad); background: #fff0dc; color: #694018; }
.connection-error button { border: 0; background: none; text-decoration: underline; }
main { margin-left: var(--rail); padding: var(--pad); display: grid; align-content: start; gap: 30px; }
.hero { display: flex; align-items: center; justify-content: space-between; padding: var(--pad); min-height: clamp(320px, 26.7vw, 415px); border-radius: 30px; background: linear-gradient(112deg,#211a52,#393185 52%,#6454a2); overflow: hidden; }
.hero-copy { flex: 1; }
.eyebrow { color: #ecd8b3; display: flex; align-items: center; gap: 12px; }
.eyebrow::before { content: ''; width: 8px; height: 8px; border-radius: 50%; background: #d2ae6d; }
.hero h1 { color: #f9f8ee; font-size: clamp(42px, 3.73vw, 60px); line-height: 1.13; margin: 21px 0 16px; letter-spacing: -.04em; }
.hero p { color: #dbd5f0; line-height: 1.5; }
.gold { color: #211d3f; background: #ebd5ab; margin-top: 23px; }
.hero-art { width: 46%; aspect-ratio: 43 / 30; margin-block: -22px; background: url('/community.svg') center / contain no-repeat; }
.services { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 15px; }
.card { background: var(--surface); border: 1px solid var(--line); border-radius: 20px; }
.service { gap: clamp(10px, 1vw, 16px); padding: clamp(12px, 1.32vw, 20px); min-height: 101px; }
.service strong { font-size: clamp(16px, 1.2vw, 20px); }
.service small { font-size: 12px; }
.symbol { width: clamp(42px, 3.85vw, 59px); height: clamp(42px, 3.85vw, 59px); border-radius: 15px; justify-content: center; flex: none; }
.symbol svg { width: 27px; height: 27px; }
.swap { background: #ddede7; color: #245b4c; }
.help { background: #fbe9d6; color: #986132; }
.study { background: #e7e4f5; color: #69608e; }
.aid { background: #f8e1e5; color: #ae5f73; }
.quick { flex-wrap: wrap; gap: 12px; }
.soft, .bubble { background: var(--soft); }
.listing-grid { display: grid; grid-template-columns: repeat(auto-fit,minmax(min(210px,100%),1fr)); gap: 16px; margin-top: 16px; }
.listing, .panel { padding: 24px; }
.listing small { display: flex; align-items: center; gap: 5px; margin: 12px 0 4px; }
.listing:target, .draft:target { border-color: var(--accent); }
.panel { max-width: 720px; display: grid; gap: 12px; }
.bubble { width: fit-content; padding: 12px 16px; border-radius: 14px; color: var(--ink); }
.mine { justify-self: end; background: var(--primary); color: white; }
.draft label { display: grid; gap: 5px; font-weight: 600; }
.draft :is(input,select,textarea) { width: 100%; padding: 10px; border: 1px solid var(--line); border-radius: 9px; background: var(--surface); }
.profile-card, .person-card { overflow-wrap: anywhere; min-width: 0; }
.person-card > div { min-width: 0; }
.profile-form { display: grid; gap: 14px; min-width: 0; }
.profile-form textarea { resize: vertical; }
.profile-card button { border: 0; cursor: pointer; }
.profile-bio { white-space: pre-wrap; }
.profile-saved { display: flex; align-items: center; gap: 8px; color: var(--accent); }
@media (max-width: 1150px) {
  .services { grid-template-columns: repeat(2,minmax(0,1fr)); }
  .service { min-height: 80px; }
}
@media (max-width: 950px) {
  :root { --rail: 0px; }
  .rail { position: fixed; inset: auto 0 0; width: 100%; padding: 5px 8px max(5px,env(safe-area-inset-bottom)); overflow: visible; border: 1px solid var(--line); }
  .rail > :not(nav), .topbar .location { display: none; }
  nav { grid-template-columns: repeat(4,1fr); gap: 4px; }
  nav a { flex-direction: column; justify-content: center; min-height: 48px; gap: 2px; padding: 2px; font-size: 11px; }
  nav a[aria-current] { border-color: transparent; }
  nav svg { width: 19px; }
  .topbar { min-height: 72px; padding-inline: var(--pad); }
  .topbar .brand { display: flex; font-size: 30px; }
  .brand i { width: 38px; height: 38px; border-radius: 11px; }
  .brand svg { width: 24px; }
  main { padding-bottom: 85px; }
}
@media (max-width: 600px) {
  :root { --pad: 16px; }
  main { gap: 17px; }
  .hero { flex-direction: column; align-items: stretch; border-radius: 22px; padding: 26px; }
  .hero h1 { font-size: 40px; margin: 15px 0 10px; }
  .hero-art { align-self: center; margin: 10px 0 -16px; width: min(240px,78%); }
  .eyebrow { font-size: 10px; }
  .topbar .brand { gap: 5px; }
  .tools { gap: 6px; }
  .tools .primary { font-size: 13px; padding-inline: 10px; }
  .circle, .tools .primary { min-height: 36px; height: 36px; }
  .circle { width: 36px; }
  .language { font-size: 11px; padding: 0 1px; }
  .popup { right: -78px; }
  .services { gap: 8px; }
  .service { padding: 11px 8px; gap: 7px; border-radius: 14px; }
  .service small { font-size: 11px; }
  .symbol { width: 34px; height: 38px; border-radius: 10px; }
  .symbol svg { width: 21px; }
  .quick .button { min-height: 45px; padding: 0 12px; gap: 6px; font-size: 13px; }
}
.skip-link { position: fixed; top: -60px; left: 16px; z-index: 20; padding: 10px 18px; color: white; background: var(--primary); border-radius: 8px; }
.skip-link:focus { top: 12px; }
.page-footer { display: flex; justify-content: space-between; gap: 16px; border-top: 1px solid var(--line); padding-top: 18px; color: var(--muted); font-size: 12px; }
input:focus-visible, select:focus-visible, textarea:focus-visible { outline: 2px solid #bb9248; outline-offset: 2px; }
.hero-art { animation: float 7s ease-in-out infinite; }
@keyframes float { 50% { transform: translateY(-6px); } }
@media (max-width: 380px) { .topbar .brand { font-size: 26px; }.tools .language { display: none; }.hero h1 { font-size: 35px; } }
@media (max-width: 340px) {
  h1, h2, h3 { overflow-wrap: anywhere; }
  .tools .primary { font-size: 0; gap: 0; width: 36px; padding: 8px; }
  .services { grid-template-columns: 1fr; }
  .hero .gold { padding-inline: 12px; font-size: 13px; gap: 8px; }
  .page-footer { flex-wrap: wrap; }
}
@media (prefers-reduced-motion: reduce) { *, *::before, *::after { animation: none !important; scroll-behavior: auto !important; } }

/* Хабарландырулар */
.section-heading { display: flex; align-items: center; justify-content: space-between; gap: 16px; }
.section-heading > div { min-width: 0; }
.section-heading p { margin-top: 7px; }
.text-button { display: inline-flex; align-items: center; justify-content: center; gap: 7px; min-height: 40px; padding: 5px 0; border: 0; background: transparent; color: var(--accent); font-weight: 600; cursor: pointer; }
.text-button:hover { text-decoration: underline; text-underline-offset: 4px; }
.board-filters { padding: 24px; display: grid; gap: 20px; }
.board-filters label { display: grid; gap: 7px; color: var(--ink); font-size: 14px; font-weight: 600; }
.board-filters :is(input, select) { min-width: 0; width: 100%; min-height: 44px; padding: 10px 12px; border: 1px solid var(--line); border-radius: 10px; background: var(--surface); }
.filter-fields { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 16px; }
.search-field { display: flex; align-items: center; gap: 10px; border: 1px solid var(--line); border-radius: 12px; padding-left: 13px; color: var(--muted); background: var(--surface); }
.search-field input { border: 0; background: transparent; }
.search-field:focus-within { outline: 2px solid #bb9248; outline-offset: 2px; }
.search-field input:focus-visible { outline: 0; }
.filter-actions { display: flex; align-items: center; gap: 16px 22px; flex-wrap: wrap; padding-top: 2px; }
.board-filters .checkbox-label { display: inline-flex; align-items: center; gap: 8px; cursor: pointer; }
.board-filters .checkbox-label input { width: 18px; height: 18px; min-height: 18px; accent-color: var(--primary); }
.filter-actions > .text-button { margin-left: auto; }
.listing-grid { align-items: stretch; }
.listing-item { position: relative; display: flex; flex-direction: column; min-width: 0; gap: 0; overflow: hidden; transition: border-color .15s, box-shadow .15s; }
.listing-item:hover { border-color: #b8acd6; box-shadow: 0 7px 24px #211a520b; }
.listing-top { display: flex; align-items: center; justify-content: space-between; gap: 10px; }
.task { background: #f3e9ce; color: #86642b; }
.favorite-button { display: grid; place-items: center; width: 40px; height: 40px; border: 1px solid var(--line); border-radius: 50%; background: var(--surface); color: var(--muted); cursor: pointer; flex-shrink: 0; }
.favorite-button:hover, .favorite-button.selected { background: var(--soft); color: var(--accent); }
.listing-item h3 { overflow-wrap: anywhere; margin-top: 3px; }
.listing-item h3 a:hover { color: var(--accent); text-decoration: underline; text-underline-offset: 3px; }
.listing-excerpt { display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; font-size: 13px; margin: 12px 0 16px; overflow-wrap: anywhere; }
.listing-meta { margin-top: auto; display: flex; align-items: center; justify-content: space-between; gap: 10px; flex-wrap: wrap; }
.listing-meta strong { font-size: 18px; color: var(--accent); }
.listing-meta small { margin: 0; }
.listing-item .listing-author { margin-top: 16px; padding-top: 12px; border-top: 1px solid var(--line); flex-wrap: wrap; }
.listing-badge { display: inline-flex; align-items: center; width: fit-content; flex-shrink: 0; padding: 3px 9px; border-radius: 20px; background: var(--soft); color: var(--accent); font-size: 11px; font-weight: 650; white-space: nowrap; }
.listing-item small { flex-wrap: wrap; }
.listing-image-link { margin: -24px -24px 20px; display: block; }
.listing-image { display: block; width: 100%; height: 160px; object-fit: cover; background: var(--soft); }
.listing-empty { margin-top: 18px; padding: 36px 24px; display: grid; justify-items: center; gap: 14px; text-align: center; }
.listing-empty .button { margin-top: 5px; }
.form-error, .draft small.form-error { color: #ae3748; font-size: 14px; font-weight: 500; }
:root.dark .form-error, :root.dark .draft small.form-error { color: #ffacb5; }
.listing-item .form-error { margin-top: 10px; }
.listing-actions { display: flex; flex-wrap: wrap; align-items: center; gap: 10px; }
.listing-actions .button, .listing-empty .button, .listing-form .button { border: 0; cursor: pointer; font-size: 14px; min-height: 48px; padding: 10px 18px; }
button:disabled { cursor: wait; opacity: .6; }
.back-link { justify-self: start; }
.listing-detail { width: 100%; max-width: 1000px; overflow: hidden; }
.detail-image { display: block; width: 100%; max-height: 480px; object-fit: contain; background: var(--soft); }
.detail-content { display: grid; gap: 20px; padding: clamp(24px, 4vw, 42px); }
.detail-content h1 { overflow-wrap: anywhere; }
.detail-category { margin-top: -6px; color: var(--accent); font-size: 14px; font-weight: 600; }
.detail-price { display: block; color: var(--accent); font-size: 28px; }
.detail-location { display: flex; align-items: center; gap: 8px; }
.detail-description { white-space: pre-wrap; overflow-wrap: anywhere; color: var(--ink); line-height: 1.75; }
.detail-author { display: flex; align-items: center; gap: 14px; border-top: 1px solid var(--line); padding-top: 22px; margin-top: 3px; }
.detail-author small { margin-top: 5px; }
.danger-button { color: #a33244; background: #f9e9ec; }
:root.dark .danger-button { color: #ffb1bb; background: #542b38; }
.listing-form { width: 100%; max-width: 820px; }
.listing-form fieldset { display: grid; min-width: 0; gap: 22px; margin: 0; padding: 0; border: 0; }
.listing-form textarea { resize: vertical; min-height: 130px; }
.listing-form :is(input, select, textarea)[aria-invalid="true"] { border-color: #ae3748; }
.listing-form small { font-weight: 400; }
.form-pair { display: grid; grid-template-columns: 1fr 1fr; gap: 18px; }
.image-upload > span { display: flex; align-items: center; gap: 8px; }
.image-upload input { font-size: 14px; }
.image-upload input::file-selector-button { padding: 7px 12px; margin-right: 12px; border: 0; border-radius: 7px; background: var(--soft); color: var(--ink); cursor: pointer; }
.draft-image { display: grid; justify-items: start; gap: 5px; }
.draft-image img { max-width: 100%; width: 260px; height: 180px; object-fit: contain; background: var(--soft); border: 1px solid var(--line); border-radius: 12px; }
@media (min-width: 1400px) { .listing-grid { grid-template-columns: repeat(4, minmax(0, 1fr)); } }
@media (max-width: 700px) {
  .filter-fields { grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 12px; }
  .board-filters { padding: 18px; }
  .filter-actions > .text-button { margin-left: 0; }
  .section-heading { align-items: flex-start; }
  .section-heading h2 { font-size: 25px; }
  .section-heading > .text-button { font-size: 12px; min-height: 30px; flex-shrink: 0; }
  .listing-detail h1 { font-size: 29px; }
}
@media (max-width: 440px) {
  .filter-fields, .form-pair { grid-template-columns: 1fr; }
  .listing-form { padding: 20px; }
  .listing-actions { align-items: stretch; }
  .listing-actions .button { width: 100%; }
  .listing-grid { grid-template-columns: 1fr; }
}

/* Профильдер мен чаттар */
.social-page { display: grid; gap: 22px; min-width: 0; }
.social-page button { cursor: pointer; }
.social-page button:disabled, .social-page input:disabled, .social-page textarea:disabled { cursor: not-allowed; opacity: .65; }
.social-page .button { min-height: 46px; padding: 10px 17px; border: 1px solid transparent; font-size: 14px; gap: 8px; }
.social-heading { display: flex; align-items: center; justify-content: space-between; flex-wrap: wrap; gap: 15px; }
.social-heading p { margin-top: 8px; }
.social-heading h2 { font-size: 23px; }
.social-heading > svg { color: var(--accent); }
.social-search-bar { display: flex; align-items: stretch; flex-wrap: wrap; gap: 12px; }
.social-search { display: flex; align-items: center; gap: 12px; flex: 1 1 250px; min-width: 0; padding: 0 15px; border: 1px solid var(--line); background: var(--surface); border-radius: 14px; color: var(--muted); }
.social-search input { width: 100%; min-width: 0; border: 0; padding: 14px 0; background: transparent; }
.social-search:focus-within { outline: 2px solid #bb9248; outline-offset: 2px; }
.social-search input:focus-visible { outline: none; }
.social-avatar { display: inline-flex; align-items: center; justify-content: center; width: 48px; height: 48px; flex: 0 0 48px; border-radius: 16px; overflow: hidden; background: var(--soft); color: var(--accent); font-size: 18px; font-weight: 750; }
.social-avatar img { width: 100%; height: 100%; object-fit: cover; }
.social-avatar-large { width: 88px; height: 88px; flex-basis: 88px; font-size: 30px; border-radius: 26px; }
.people-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(min(300px, 100%), 1fr)); gap: 18px; }
.social-person { display: flex; flex-direction: column; padding: 24px; gap: 14px; min-width: 0; }
.social-person-title, .social-profile-identity { display: flex; align-items: center; gap: 14px; min-width: 0; }
.social-person-title > div { min-width: 0; }
.social-person-title h2 { font-size: 20px; overflow-wrap: anywhere; }
.social-person-title small { margin-top: 5px; overflow-wrap: anywhere; }
.social-person-bio { white-space: pre-wrap; overflow-wrap: anywhere; flex: 1; }
.social-person-tags { display: flex; gap: 6px; }
.social-person-tags:empty { display: none; }
.social-tag { display: inline-flex; width: fit-content; padding: 3px 8px; border: 1px solid var(--line); border-radius: 7px; color: var(--muted); background: var(--soft); font-size: 11px; line-height: 1.4; font-weight: 650; }
.social-empty { display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 15px; padding: 38px 24px; text-align: center; }
.social-empty > svg { color: var(--accent); }
.social-empty h2 { font-size: 24px; }
.social-error { padding: 12px 15px; border: 1px solid #bf7272; border-radius: 11px; background: var(--surface); color: #a13535; overflow-wrap: anywhere; }
:root.dark .social-error { color: #ffb7b7; }
.social-text-link, .social-text-button { display: inline-flex; align-items: center; width: fit-content; gap: 7px; color: var(--accent); font-size: 14px; font-weight: 650; text-decoration: underline; text-underline-offset: 3px; }
.social-text-button { border: 0; background: transparent; padding: 6px 0; }
.social-icon-button { display: inline-flex; align-items: center; justify-content: center; width: 38px; height: 38px; border: 1px solid var(--line); border-radius: 10px; background: var(--soft); }
.social-sr-only { position: absolute; width: 1px; height: 1px; padding: 0; margin: -1px; overflow: hidden; clip: rect(0,0,0,0); white-space: nowrap; border: 0; }
.social-profile { width: 100%; max-width: 820px; gap: 22px; }
.social-name-line { display: flex; flex-wrap: wrap; align-items: center; gap: 9px; margin-bottom: 7px; }
.social-stats { display: flex; flex-wrap: wrap; gap: 16px 35px; border-block: 1px solid var(--line); padding-block: 18px; }
.social-stats strong { font-size: 25px; }
.social-avatar-editor { display: flex; flex-wrap: wrap; align-items: center; gap: 18px; }
.social-avatar-editor > div { min-width: 0; flex: 1 1 190px; }
.social-upload { position: relative; width: fit-content; display: flex !important; align-items: center; padding: 10px 13px; border-radius: 11px; margin-bottom: 8px; background: var(--soft); color: var(--accent); cursor: pointer; }
.social-upload input { position: absolute; inset: 0; opacity: 0; cursor: pointer; }
.social-upload:focus-within { outline: 2px solid #bb9248; outline-offset: 3px; }
.social-owned-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(min(270px, 100%), 1fr)); gap: 15px; }
.social-owned-listing { padding: 22px; display: flex; flex-direction: column; justify-content: space-between; gap: 18px; overflow-wrap: anywhere; }
.social-owned-listing h3 { margin: 10px 0; }
.social-chat-create { padding: 25px; display: grid; gap: 20px; max-width: 850px; }
.social-member-fieldset { margin: 0; padding: 12px; min-width: 0; border: 1px solid var(--line); border-radius: 12px; }
.social-member-fieldset legend { padding: 0 7px; font-weight: 650; }
.social-members { max-height: 270px; overflow-y: auto; display: grid; gap: 8px; }
.social-member { display: flex !important; align-items: center; gap: 12px !important; padding: 9px; border-radius: 9px; cursor: pointer; }
.social-member:hover { background: var(--soft); }
.social-member input { width: 18px !important; height: 18px; flex: 0 0 18px; accent-color: var(--primary); }
.social-member > span:not(.social-avatar):not(.social-tag) { min-width: 0; overflow-wrap: anywhere; flex: 1; }
.social-member .social-avatar { width: 38px; height: 38px; flex-basis: 38px; font-size: 15px; border-radius: 12px; }
.chat-workspace { display: grid; grid-template-columns: minmax(220px, .85fr) minmax(0, 2fr); min-height: 550px; overflow: hidden; }
.chat-list { border-right: 1px solid var(--line); min-width: 0; }
.chat-list > h2 { padding: 22px; font-size: 20px; display: flex; justify-content: space-between; gap: 8px; }
.chat-list > h2 span { font-size: 14px; color: var(--muted); }
.chat-list-item { display: flex; align-items: center; gap: 10px; padding: 17px 16px; border-block: 1px solid transparent; }
.chat-list-item:hover, .chat-list-item.selected { background: var(--soft); }
.chat-list-item.selected { border-color: var(--line); box-shadow: inset 3px 0 var(--accent); }
.chat-list-item > div { flex: 1; min-width: 0; }
.chat-list-item strong { display: block; font-size: 15px; overflow: hidden; white-space: nowrap; text-overflow: ellipsis; }
.chat-list-item small { white-space: nowrap; overflow: hidden; text-overflow: ellipsis; margin-top: 5px; }
.chat-list-item .social-tag { margin-top: 5px; padding-block: 1px; }
.chat-unread { display: inline-flex; align-items: center; justify-content: center; flex: none; min-width: 22px; height: 22px; padding: 0 5px; border-radius: 8px; background: var(--primary); color: white; font-size: 11px; font-weight: 750; }
.chat-conversation { min-width: 0; display: flex; flex-direction: column; }
.chat-conversation > .social-empty { flex: 1; }
.chat-header { padding: 22px; border-bottom: 1px solid var(--line); display: grid; gap: 9px; }
.chat-header h2 { font-size: 21px; overflow-wrap: anywhere; }
.chat-participants { font-size: 13px; overflow-wrap: anywhere; }
.chat-demo-note { padding: 7px 10px; border-radius: 8px; background: var(--soft); }
.chat-messages { height: 390px; overflow-y: auto; overflow-x: hidden; padding: 22px; display: flex; flex-direction: column; align-items: flex-start; gap: 14px; background: var(--bg); }
.chat-messages > .social-empty { align-self: stretch; margin: auto 0; }
.chat-message { max-width: 88%; min-width: 85px; padding: 12px 15px; border: 1px solid var(--line); border-radius: 15px 15px 15px 4px; background: var(--surface); }
.chat-message p { white-space: pre-wrap; overflow-wrap: anywhere; color: var(--ink); }
.chat-message.outgoing { align-self: flex-end; background: var(--primary); border-color: transparent; color: white; border-radius: 15px 15px 4px 15px; }
.chat-message.outgoing p { color: white; }
.chat-message-meta { margin-top: 8px; display: flex; flex-wrap: wrap; justify-content: flex-end; align-items: center; gap: 8px; color: var(--muted); font-size: 10px; }
.chat-message-meta span { display: inline-flex; align-items: center; gap: 3px; }
.chat-message.outgoing .chat-message-meta { color: #e0dcef; }
.chat-message-author { display: inline-block; font-size: 12px; font-weight: 700; margin-bottom: 5px; color: var(--accent); }
.chat-compose { display: flex; flex-wrap: wrap; align-items: flex-end; gap: 10px; padding: 17px; border-top: 1px solid var(--line); margin-top: auto; }
.chat-compose textarea { flex: 1 1 150px; width: 100%; min-width: 0; resize: vertical; min-height: 54px; max-height: 170px; border: 1px solid var(--line); border-radius: 12px; padding: 12px; background: var(--surface); }
.chat-compose .button { min-height: 54px; }
.chat-compose .social-error { width: 100%; }
.chat-inline-error { padding: 10px 16px; }
@media (max-width: 1150px) and (min-width: 951px) { .chat-workspace { grid-template-columns: minmax(180px, .7fr) minmax(0, 1.5fr); }.chat-list-item .social-avatar { display: none; } }
@media (max-width: 680px) {
  .social-page { gap: 18px; }.social-heading h1 { font-size: 30px; }.social-heading > .quick { width: 100%; }.social-heading > .quick .button { flex: 1; }
  .social-person, .social-profile, .social-chat-create { padding: 20px; }.social-profile-identity { align-items: flex-start; }.social-profile-identity .social-avatar-large { width: 66px; height: 66px; flex-basis: 66px; border-radius: 20px; }.social-name-line h2 { font-size: 24px; }
  .chat-workspace { grid-template-columns: minmax(0, 1fr); }.chat-list { border-right: 0; border-bottom: 1px solid var(--line); max-height: 260px; overflow-y: auto; }.chat-list > h2 { padding: 16px; }.chat-list-item { padding: 12px 16px; }.chat-header { padding: 18px; }.chat-messages { height: 380px; padding: 16px; }.chat-message { max-width: 92%; }.chat-compose { padding: 12px; }.chat-compose .button { padding-inline: 12px; }.chat-compose .button span { display: none; }
  .social-member { gap: 8px !important; padding-inline: 3px; }.social-member .social-avatar { display: none; }
}
