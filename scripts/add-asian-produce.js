// One-shot script: adds ~50 new Asian/South Asian vegetables to the Produce Matcher catalog.
// Run: node scripts/add-asian-produce.js
// Requires: saved auth session at tests/.auth.json OR test credentials in env.

const { chromium } = require('@playwright/test');
const path = require('path');
const fs   = require('fs');

const AUTH_FILE = path.join(__dirname, '..', 'tests', '.auth.json');
const EMAIL    = process.env.TEST_EMAIL    || 'zayyakhan2.2@gmail.com';
const PASSWORD = process.env.TEST_PASSWORD || 'Imrankhan889@';

// ── New items (all missing from the existing 297-item Truong catalog) ──────────
const NEW_ITEMS = [
  // ── Mushrooms ───────────────────────────────────────────────────────────────
  {
    id: 'wood-ear-mushroom',
    name: 'WOOD EAR MUSHROOM',
    aliases: ['black fungus','cloud ear fungus','jelly ear','auricularia','kikurage','목이버섯','nam meo','jamur kuping','hed hu nu','mù er','jew\'s ear'],
    unit: 'lb',
    image: 'https://upload.wikimedia.org/wikipedia/commons/thumb/2/21/Jelly_Ear%2C_Auricularia_auricula-judae%2C_UK_2.jpg/400px-Jelly_Ear%2C_Auricularia_auricula-judae%2C_UK_2.jpg',
  },
  {
    id: 'snow-fungus',
    name: 'SNOW FUNGUS',
    aliases: ['silver ear fungus','white jelly mushroom','tremella','xue er','bai mu er','yin er','nam tuyet','jamur putih'],
    unit: 'each',
    image: 'https://upload.wikimedia.org/wikipedia/commons/thumb/b/b9/Tremella_fuciformis_337510.jpg/400px-Tremella_fuciformis_337510.jpg',
  },
  {
    id: 'straw-mushroom',
    name: 'STRAW MUSHROOM',
    aliases: ['paddy straw mushroom','volvariella','chinese mushroom','cao gu','nam rom','nam rom','jamur merang'],
    unit: 'lb',
    image: 'https://upload.wikimedia.org/wikipedia/commons/thumb/f/fc/StrawMushroom.jpg/400px-StrawMushroom.jpg',
  },
  {
    id: 'button-mushroom',
    name: 'BUTTON MUSHROOM',
    aliases: ['white mushroom','champignon','common mushroom','table mushroom','양송이버섯','nam mo trang','jamur kancing putih','agaricus'],
    unit: 'lb',
    image: 'https://upload.wikimedia.org/wikipedia/commons/thumb/0/01/ChampignonMushroom.jpg/400px-ChampignonMushroom.jpg',
  },
  {
    id: 'cremini-mushroom',
    name: 'CREMINI MUSHROOM',
    aliases: ['crimini','baby bella','baby portobello','brown mushroom','chestnut mushroom','swiss brown','roman brown','italian brown'],
    unit: 'lb',
    image: 'https://upload.wikimedia.org/wikipedia/commons/thumb/3/3a/09-09-2009Cremini.jpg/400px-09-09-2009Cremini.jpg',
  },
  {
    id: 'lions-mane-mushroom',
    name: "LION'S MANE MUSHROOM",
    aliases: ['hericium erinaceus','yamabushitake','monkey head mushroom','houtou','pom pom mushroom','노루궁뎅이버섯','nam dau khi','jamur surai singa'],
    unit: 'each',
    image: 'https://upload.wikimedia.org/wikipedia/commons/thumb/8/87/Igelstachelbart_P6300002.jpg/400px-Igelstachelbart_P6300002.jpg',
  },

  // ── East Asian ──────────────────────────────────────────────────────────────
  {
    id: 'edamame',
    name: 'EDAMAME',
    aliases: ['fresh soybeans in pod','mao dou','mukimame','枝豆','dau nanh luoc','bataw'],
    unit: 'lb',
    image: 'https://upload.wikimedia.org/wikipedia/commons/thumb/e/e7/Edamame_by_Zesmerelda_in_Chicago.jpg/400px-Edamame_by_Zesmerelda_in_Chicago.jpg',
  },
  {
    id: 'soybean-sprout',
    name: 'SOYBEAN SPROUT',
    aliases: ['kongnamul','yellow soybean sprouts','yellow bean sprouts','dou ya','콩나물','moyashi','gia do tuong'],
    unit: 'lb',
    image: 'https://upload.wikimedia.org/wikipedia/commons/thumb/4/4f/Kongnamul_%28soybean_sprout%29_2.jpg/400px-Kongnamul_%28soybean_sprout%29_2.jpg',
  },
  {
    id: 'tatsoi',
    name: 'TATSOI',
    aliases: ['tat choy','rosette bok choy','spoon mustard','spinach mustard','塌棵菜','flat cabbage','japanese flat cabbage'],
    unit: 'bunch',
    image: 'https://upload.wikimedia.org/wikipedia/commons/thumb/6/6c/Brassica_rapa_subsp_narinosa.jpg/400px-Brassica_rapa_subsp_narinosa.jpg',
  },
  {
    id: 'mizuna',
    name: 'MIZUNA',
    aliases: ['japanese mustard greens','kyona','水菜','spider mustard','xui cai'],
    unit: 'bunch',
    image: 'https://upload.wikimedia.org/wikipedia/commons/thumb/c/cd/Mizuna_001.jpg/400px-Mizuna_001.jpg',
  },
  {
    id: 'komatsuna',
    name: 'KOMATSUNA',
    aliases: ['japanese mustard spinach','小松菜','tendergreen mustard','cai be xanh nhat'],
    unit: 'bunch',
    image: 'https://upload.wikimedia.org/wikipedia/commons/thumb/d/dd/Komatsuna.jpg/400px-Komatsuna.jpg',
  },
  {
    id: 'shishito-pepper',
    name: 'SHISHITO PEPPER',
    aliases: ['shishito','kkwari-gochu','꽈리고추','lion head pepper','獅子唐辛子','japanese sweet pepper','wrinkled pepper','padron pepper'],
    unit: 'lb',
    image: 'https://upload.wikimedia.org/wikipedia/commons/thumb/1/16/Kkwari-gochu.jpg/400px-Kkwari-gochu.jpg',
  },
  {
    id: 'myoga',
    name: 'MYOGA',
    aliases: ['japanese ginger bud','茗荷','zingiber mioga','양하','myoga ginger'],
    unit: 'each',
    image: 'https://upload.wikimedia.org/wikipedia/commons/thumb/0/0a/Myoga-fushimi.jpg/400px-Myoga-fushimi.jpg',
  },
  {
    id: 'korean-radish',
    name: 'KOREAN RADISH',
    aliases: ['mu','무','korean daikon','joseon radish','kkakdugi radish','white radish korean'],
    unit: 'each',
    image: 'https://upload.wikimedia.org/wikipedia/commons/thumb/5/54/Korean.radish.jpg/400px-Korean.radish.jpg',
  },
  {
    id: 'doraji',
    name: 'DORAJI',
    aliases: ['bellflower root','도라지','platycodon grandiflorus','balloon flower root','桔梗','kikyo'],
    unit: 'lb',
    image: 'https://upload.wikimedia.org/wikipedia/commons/thumb/3/33/Platycodon_grandiflorus_2.jpg/400px-Platycodon_grandiflorus_2.jpg',
  },
  {
    id: 'gosari',
    name: 'GOSARI',
    aliases: ['bracken fern','고사리','fernbrake','warabi','fiddlehead fern','蕨菜','pakis','fern shoot'],
    unit: 'lb',
    image: 'https://upload.wikimedia.org/wikipedia/commons/thumb/e/e1/Fiddlehead_closeup.png/400px-Fiddlehead_closeup.png',
  },
  {
    id: 'fresh-lily-bulb',
    name: 'FRESH LILY BULB',
    aliases: ['bai he','百合','yurine','lily root','lily bulb scales','edible lily bulb','baekhaap'],
    unit: 'each',
    image: 'https://upload.wikimedia.org/wikipedia/commons/thumb/b/b4/Yurine_donburi.JPG/400px-Yurine_donburi.JPG',
  },
  {
    id: 'lotus-seed',
    name: 'LOTUS SEED',
    aliases: ['lian zi','莲子','fresh lotus seeds','lotus nut','kamal gatta','tamara vithai','hạt sen','biji teratai','연밥'],
    unit: 'lb',
    image: 'https://upload.wikimedia.org/wikipedia/commons/thumb/1/14/Lotus_seed.jpg/400px-Lotus_seed.jpg',
  },
  {
    id: 'celtuce',
    name: 'CELTUCE',
    aliases: ['stem lettuce','wosun','莴笋','celery lettuce','asparagus lettuce','wo sun','qingsun','chinese lettuce','lettuce stem'],
    unit: 'each',
    image: 'https://upload.wikimedia.org/wikipedia/commons/thumb/8/87/Celtuce.jpg/400px-Celtuce.jpg',
  },
  {
    id: 'wasabi',
    name: 'WASABI',
    aliases: ['japanese horseradish','eutrema japonicum','山葵','고추냉이','hon wasabi','real wasabi','wasabi rhizome'],
    unit: 'each',
    image: 'https://upload.wikimedia.org/wikipedia/commons/thumb/5/53/Wasabia_japonica_4.JPG/400px-Wasabia_japonica_4.JPG',
  },
  {
    id: 'yuzu',
    name: 'YUZU',
    aliases: ['citrus junos','柚子','유자','yuja','japanese citrus','yuja tea citrus'],
    unit: 'each',
    image: 'https://upload.wikimedia.org/wikipedia/commons/thumb/a/a6/Yuzu_oranges_%286459456959%29.jpg/400px-Yuzu_oranges_%286459456959%29.jpg',
  },
  {
    id: 'chinese-artichoke',
    name: 'CHINESE ARTICHOKE',
    aliases: ['crosne','stachys affinis','japanese artichoke','chorogi','チョロギ','草石蚕','spiral tuber','knot root'],
    unit: 'lb',
    image: 'https://upload.wikimedia.org/wikipedia/commons/thumb/7/7c/Stachys_sieboldii1.jpg/400px-Stachys_sieboldii1.jpg',
  },
  {
    id: 'young-ginger',
    name: 'YOUNG GINGER',
    aliases: ['baby ginger','stem ginger','new ginger','tender ginger','kora adrak','jahe muda','khing on','gung non','shin shoga','새생강'],
    unit: 'lb',
    image: 'https://upload.wikimedia.org/wikipedia/commons/thumb/9/93/Ingwer_2_%28fcm%29.jpg/400px-Ingwer_2_%28fcm%29.jpg',
  },

  // ── Southeast Asian ─────────────────────────────────────────────────────────
  {
    id: 'torch-ginger-flower',
    name: 'TORCH GINGER FLOWER',
    aliases: ['etlingera elatior','bunga kantan','philippine wax flower','wild ginger flower','kecombrang','honje','dok dahla','hoa gung duoc'],
    unit: 'each',
    image: 'https://upload.wikimedia.org/wikipedia/commons/thumb/2/29/Etlingera_elatior2.jpg/400px-Etlingera_elatior2.jpg',
  },
  {
    id: 'sand-ginger',
    name: 'SAND GINGER',
    aliases: ['kencur','kaempferia galanga','aromatic ginger','cekur','boesenbergia galanga','galangal kecil','proh hom','chandramula'],
    unit: 'lb',
    image: 'https://upload.wikimedia.org/wikipedia/commons/thumb/3/33/Kaempferia_galanga_RBG.jpg/400px-Kaempferia_galanga_RBG.jpg',
  },
  {
    id: 'saluyot-leaves',
    name: 'SALUYOT LEAVES',
    aliases: ['jute mallow','corchorus olitorius','molokhia','mulukhiyah','molokheya','ewedu','nalita','lalo','rau day','saluyot'],
    unit: 'bunch',
    image: 'https://upload.wikimedia.org/wikipedia/commons/thumb/a/a0/Corchorus_olitorius_%282%29.JPG/400px-Corchorus_olitorius_%282%29.JPG',
  },
  {
    id: 'katuk-leaves',
    name: 'KATUK LEAVES',
    aliases: ['sauropus androgynus','sweet leaf','star gooseberry leaf','cekur manis','phak waan baan','rau ngot','chekkurmanis','mani cai','tropical asparagus'],
    unit: 'bunch',
    image: 'https://upload.wikimedia.org/wikipedia/commons/thumb/c/c4/Sauropus_androgynus_at_Kadavoor.jpg/400px-Sauropus_androgynus_at_Kadavoor.jpg',
  },
  {
    id: 'kaffir-lime',
    name: 'KAFFIR LIME',
    aliases: ['makrut lime','citrus hystrix','thai lime','porcupine orange','leech lime','magrood','jeruk purut','kabuyaw','combava'],
    unit: 'each',
    image: 'https://upload.wikimedia.org/wikipedia/commons/thumb/e/e8/Citrus_hystrix_fruit.jpg/400px-Citrus_hystrix_fruit.jpg',
  },
  {
    id: 'winged-yam',
    name: 'WINGED YAM',
    aliases: ['dioscorea alata','greater yam','water yam','ubi','khoai mo','ratalu','violet yam','uhi'],
    unit: 'lb',
    image: 'https://upload.wikimedia.org/wikipedia/commons/thumb/4/4a/Kambar_wh.jpg/400px-Kambar_wh.jpg',
  },
  {
    id: 'water-mimosa',
    name: 'WATER MIMOSA',
    aliases: ['neptunia oleracea','rau nhut','pak kacheat','sensitive neptunia','mimosa air','floating sensitive plant','phan yod'],
    unit: 'bunch',
    image: 'https://upload.wikimedia.org/wikipedia/commons/thumb/e/e6/Neptunia_oleracea1.jpg/400px-Neptunia_oleracea1.jpg',
  },

  // ── Indian / South Asian ────────────────────────────────────────────────────
  {
    id: 'suran',
    name: 'SURAN',
    aliases: ['elephant foot yam','jimikand','amorphophallus paeoniifolius','ol','senai kizhangu','chena','kandagadda','ubi iles','porang'],
    unit: 'lb',
    image: 'https://upload.wikimedia.org/wikipedia/commons/thumb/6/61/Amorphophallus_Paeoniifolius_g.jpg/400px-Amorphophallus_Paeoniifolius_g.jpg',
  },
  {
    id: 'amla',
    name: 'AMLA',
    aliases: ['indian gooseberry','phyllanthus emblica','aonla','nelli','आंवला','amlaki','awla','emblic myrobalan','ma kham pom'],
    unit: 'lb',
    image: 'https://upload.wikimedia.org/wikipedia/commons/thumb/7/7f/Phyllanthus_officinalis.jpg/400px-Phyllanthus_officinalis.jpg',
  },
  {
    id: 'fresh-green-chickpea',
    name: 'FRESH GREEN CHICKPEA',
    aliases: ['hara chana','hola chana','hurda','chholia','green garbanzo','kaccha chana','harbhara','fresh chana','green gram pods'],
    unit: 'lb',
    image: 'https://upload.wikimedia.org/wikipedia/commons/thumb/8/89/Chickpea_BNC.jpg/400px-Chickpea_BNC.jpg',
  },
  {
    id: 'neem-leaves',
    name: 'NEEM LEAVES',
    aliases: ['azadirachta indica leaves','veppilai','bevu','nimtree leaves','margosa leaves','indian lilac leaves','dawun nim','daun nimba','bai sadao'],
    unit: 'bunch',
    image: 'https://upload.wikimedia.org/wikipedia/commons/thumb/8/8e/Neem_tree_leaves.JPG/400px-Neem_tree_leaves.JPG',
  },
  {
    id: 'water-caltrop',
    name: 'WATER CALTROP',
    aliases: ['singhara','trapa bispinosa','indian water chestnut','paniphal','bat nut','devil pod','ling nut','lingzi','水菱角','菱角'],
    unit: 'lb',
    image: 'https://upload.wikimedia.org/wikipedia/commons/thumb/9/94/Trapa_natans_kz6.JPG/400px-Trapa_natans_kz6.JPG',
  },
  {
    id: 'kantola',
    name: 'KANTOLA',
    aliases: ['spine gourd','momordica dioica','teasle gourd','tindsi','kartoli','kankrol','phagla','kakrol','spiny bitter gourd','bonkorola'],
    unit: 'lb',
    image: 'https://upload.wikimedia.org/wikipedia/commons/thumb/8/86/Erumapaval.JPG/400px-Erumapaval.JPG',
  },
  {
    id: 'raw-banana',
    name: 'RAW BANANA',
    aliases: ['kachcha kela','green unripe banana vegetable','raw cooking banana','kacha kela','vazhakkai','aratikaya','bale kai','कच्चा केला'],
    unit: 'lb',
    image: 'https://upload.wikimedia.org/wikipedia/commons/thumb/6/60/Bananes_encore_verte.jpg/400px-Bananes_encore_verte.jpg',
  },
  {
    id: 'sword-bean',
    name: 'SWORD BEAN',
    aliases: ['canavalia ensiformis','jackbean','jack bean','wonder bean','kacang parang','tonkin bean','giant stock bean'],
    unit: 'lb',
    image: 'https://upload.wikimedia.org/wikipedia/commons/thumb/1/16/Canava1.jpg/400px-Canava1.jpg',
  },
  {
    id: 'agati-flower',
    name: 'AGATI FLOWER',
    aliases: ['sesbania grandiflora','vegetable hummingbird flower','agathi','agastya','katurai','katuray','dok khae','hoa so dua','bunga agati'],
    unit: 'bunch',
    image: 'https://upload.wikimedia.org/wikipedia/commons/thumb/7/74/Starr_050518-1632_Sesbania_grandiflora.jpg/400px-Starr_050518-1632_Sesbania_grandiflora.jpg',
  },
  {
    id: 'moringa-flower',
    name: 'MORINGA FLOWER',
    aliases: ['drumstick flower','moringa oleifera flower','sahajan phool','murungai poo','malunggay flower','ben tree flower','dok marum','hoa chum ngay','bunga kelor'],
    unit: 'bunch',
    image: 'https://upload.wikimedia.org/wikipedia/commons/thumb/3/3f/Moringa_flower_5.jpg/400px-Moringa_flower_5.jpg',
  },
  {
    id: 'colocasia-stem',
    name: 'COLOCASIA STEM',
    aliases: ['taro stem','arbi stalk','arvi stalk','taro petiole','kachalu stalk','patra stalk','gabi stalk','lompong','gathi','dasheen stalk'],
    unit: 'bunch',
    image: 'https://upload.wikimedia.org/wikipedia/commons/thumb/0/06/Taro_in_Fiji%2C_photo_by_Sarfraz_Rivzi.JPG/400px-Taro_in_Fiji%2C_photo_by_Sarfraz_Rivzi.JPG',
  },
  {
    id: 'fresh-turmeric-leaf',
    name: 'FRESH TURMERIC LEAF',
    aliases: ['curcuma longa leaf','haldi patta','pasupu aaku','manjal ilai','daun kunyit','bai kha min','la nghe','olahan kunyit'],
    unit: 'bunch',
    image: 'https://upload.wikimedia.org/wikipedia/commons/thumb/a/ab/Turmeric_inflorescence.jpg/400px-Turmeric_inflorescence.jpg',
  },
  {
    id: 'moth-bean-pods',
    name: 'MOTH BEAN PODS',
    aliases: ['matki','vigna aconitifolia','mat bean','moth bean','dew bean','turkish gram','dew gram','hara matki','pappadum bean'],
    unit: 'lb',
    image: 'https://upload.wikimedia.org/wikipedia/commons/thumb/2/2f/Matki.JPG/400px-Matki.JPG',
  },
  {
    id: 'fresh-black-eyed-pea',
    name: 'FRESH BLACK-EYED PEA',
    aliases: ['fresh cowpea','vigna unguiculata','lobiya','chawli','fresh lobia','southern pea','field pea','crowder pea','kunde','niebe','payar','豇豆'],
    unit: 'lb',
    image: 'https://upload.wikimedia.org/wikipedia/commons/thumb/0/08/Lobia.jpg/400px-Lobia.jpg',
  },
  {
    id: 'fresh-pigeon-pea',
    name: 'FRESH PIGEON PEA',
    aliases: ['hara toor','cajanus cajan','fresh arhar','green pigeon pea','fresh tuvar','red gram fresh','congo pea','gungo peas','gandule bean','togari kaalu','thuvaram fresh'],
    unit: 'lb',
    image: 'https://upload.wikimedia.org/wikipedia/commons/thumb/9/92/Cajanus_cajan_Blanco1.167-cropped.jpg/400px-Cajanus_cajan_Blanco1.167-cropped.jpg',
  },
  {
    id: 'jackfruit-seed',
    name: 'JACKFRUIT SEED',
    aliases: ['artocarpus heterophyllus seeds','kathal ke beej','palakkai vithai','langka seed','jacknut','nangka seed','phanasache bij','mit seed'],
    unit: 'lb',
    image: 'https://upload.wikimedia.org/wikipedia/commons/thumb/5/50/Jackfruit_seeds_on_a_plate.jpg/400px-Jackfruit_seeds_on_a_plate.jpg',
  },

  // ── Common vegetables not in catalog ────────────────────────────────────────
  {
    id: 'sweet-corn',
    name: 'SWEET CORN',
    aliases: ['corn on the cob','sweetcorn','sugar corn','maize','玉米','khao pod','bap','mais','bhutta','jagung','mais sucre'],
    unit: 'each',
    image: 'https://upload.wikimedia.org/wikipedia/commons/thumb/7/79/VegCorn.jpg/400px-VegCorn.jpg',
  },
  {
    id: 'purple-cabbage',
    name: 'PURPLE CABBAGE',
    aliases: ['red cabbage','blaukraut','blue cabbage','repolyo morado','紫甘蓝','cai tim','kohl merah ungu','murasaki kyabetsu','rode kool'],
    unit: 'each',
    image: 'https://upload.wikimedia.org/wikipedia/commons/thumb/8/85/Brassica_oleracea_var_capitata_Rubyball.jpg/400px-Brassica_oleracea_var_capitata_Rubyball.jpg',
  },
  {
    id: 'green-asparagus',
    name: 'GREEN ASPARAGUS',
    aliases: ['asparagus','garden asparagus','sparrow grass','asparagus officinalis','asparagus hijau','mang tay xanh','asparagus berde'],
    unit: 'bunch',
    image: 'https://upload.wikimedia.org/wikipedia/commons/thumb/3/3d/Asparagus-Bundle.jpg/400px-Asparagus-Bundle.jpg',
  },
  {
    id: 'white-asparagus',
    name: 'WHITE ASPARAGUS',
    aliases: ['bleached asparagus','weisser spargel','asperge blanche','芦笋','asuparagasu shiroi','mang tay trang','asparagus putih'],
    unit: 'bunch',
    image: 'https://upload.wikimedia.org/wikipedia/commons/thumb/c/c5/Weißer_Spargel_%28Wincheringen%29_2.jpg/400px-Weißer_Spargel_%28Wincheringen%29_2.jpg',
  },
  {
    id: 'baby-corn',
    name: 'BABY CORN',
    aliases: ['mini corn','young corn','candle corn','ข้าวโพดอ่อน','bap non','mais nain','young maize','cocktail corn','elote tierno'],
    unit: 'lb',
    image: 'https://upload.wikimedia.org/wikipedia/commons/thumb/1/12/Baby_corn_-_Lotus%2C_Sheffield_-_2014-08-03_-Andy_Mabbett-03.jpg/400px-Baby_corn_-_Lotus%2C_Sheffield_-_2014-08-03_-Andy_Mabbett-03.jpg',
  },
];

async function run() {
  const browser = await chromium.launch({ headless: true, channel: 'chrome' });
  const ctxOpts = { baseURL: 'https://www.trackaisle.com' };
  if (fs.existsSync(AUTH_FILE)) ctxOpts.storageState = AUTH_FILE;

  const ctx  = await browser.newContext(ctxOpts);
  const page = await ctx.newPage();

  page.on('console', m => { if (m.type() === 'error') console.error('[PAGE]', m.text()); });

  console.log('→ Opening app…');
  await page.goto('/app');
  await page.waitForTimeout(2000);

  // Sign in if needed
  const needsLogin = await page.locator('button:has-text("Sign in")').isVisible({ timeout: 3000 }).catch(() => false);
  if (needsLogin) {
    console.log('→ Signing in…');
    await page.getByRole('textbox', { name: /email/i }).fill(EMAIL);
    await page.getByRole('textbox', { name: /password/i }).fill(PASSWORD);
    await page.getByRole('button', { name: 'Sign in' }).click();
    await page.waitForSelector('#page-title', { timeout: 30000 });
    await ctx.storageState({ path: AUTH_FILE });
    console.log('  ✓ Signed in');
  } else {
    console.log('  ✓ Already signed in');
  }

  // Navigate to Produce Matcher to trigger pcSeed() which initialises the catalog
  console.log('→ Opening Produce Matcher (triggers catalog seed)…');
  await page.click('[data-pg="produce"]');
  await page.waitForTimeout(2000); // give pcSeed() time to run

  // Inject new items via the app's own pcSaveCatalog / cloudMark functions
  const result = await page.evaluate((items) => {
    if (typeof pcLoadCatalog === 'undefined') return { error: 'pcLoadCatalog not found' };

    const existing = pcLoadCatalog();
    const existingIds = new Set(existing.map(x => x.id));
    const now = new Date().toISOString();

    const toAdd = items
      .filter(x => !existingIds.has(x.id))
      .map(x => ({
        id:       x.id,
        name:     x.name,
        aliases:  x.aliases,
        unit:     x.unit,
        cost:     0,
        image:    x.image,
        source:   'custom',
        addedAt:  now,
      }));

    if (!toAdd.length) return { added: 0, skipped: items.length };

    pcSaveCatalog([...existing, ...toAdd]);
    if (typeof cloudMark === 'function') cloudMark('produce_catalog');

    return { added: toAdd.length, skipped: items.length - toAdd.length, ids: toAdd.map(x => x.id) };
  }, NEW_ITEMS);

  if (result.error) {
    console.error('✗ Error:', result.error);
    await browser.close();
    process.exit(1);
  }

  console.log(`  ✓ Added ${result.added} items, skipped ${result.skipped} already-present`);
  if (result.ids?.length) console.log('  Items:', result.ids.join(', '));

  // Trigger cloud sync
  if (result.added > 0) {
    console.log('→ Pushing to cloud…');
    const syncResult = await page.evaluate(async () => {
      if (typeof cloudFlush === 'function') {
        await cloudFlush();
        return 'ok';
      }
      return 'cloudFlush not available';
    });
    console.log('  Cloud sync:', syncResult);
  }

  // Save updated auth state
  await ctx.storageState({ path: AUTH_FILE });
  await browser.close();
  console.log('✓ Done.');
}

run().catch(e => { console.error(e); process.exit(1); });
