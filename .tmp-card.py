import io


def edit(path, subs):
    raw = io.open(path, encoding='utf-8', newline='').read()
    for old, new in subs:
        assert raw.count(old) == 1, '%s: %r matched %d' % (path, old[:60], raw.count(old))
        raw = raw.replace(old, new, 1)
    io.open(path, 'w', encoding='utf-8', newline='').write(raw)
    print('patched ' + path)


# 1. The card enum.
edit('src/constant/index.ts', [
    ("  RuleHitCountCard = 'RuleHitCountCard',",
     "  RuleHitCountCard = 'RuleHitCountCard',\n  GpnDnsCard = 'GpnDnsCard',"),
])

# 2. Default order + visibility. First, because on a 5gpn gateway the DNS
#    decision layer is what the box is for; the card hides itself when the core
#    does not serve one.
edit('src/store/settings.ts', [
    ("""const defaultOverviewCardOrder: { card: OVERVIEW_CARD; visible: boolean }[] = [
  {
    card: OVERVIEW_CARD.ChartsCard,""",
     """const defaultOverviewCardOrder: { card: OVERVIEW_CARD; visible: boolean }[] = [
  {
    card: OVERVIEW_CARD.GpnDnsCard,
    visible: true,
  },
  {
    card: OVERVIEW_CARD.ChartsCard,"""),
])

# 3. The page's component map.
edit('src/views/OverviewPage.vue', [
    ("import ChartsCard from '@/components/overview/ChartsCard.vue'",
     "import ChartsCard from '@/components/overview/ChartsCard.vue'\n"
     "import GpnDnsCard from '@/components/overview/GpnDnsCard.vue'"),
    ("  ChartsCard,\n  NetworkCard,", "  ChartsCard,\n  GpnDnsCard,\n  NetworkCard,"),
])

# 4. Labels.
KEYS = {
    'en': {
        'gpnDnsCard': "'5gpn DNS'",
        'gpnQps': "'Queries per second'",
        'gpnCacheHitRate': "'Cache hit rate'",
        'gpnCacheEntries': "'entries'",
        'gpnDecisionMix': "'Decision mix'",
        'gpnUpstreamHealth': "'Upstream health'",
        'gpnChnrouteCn': "'CN route'",
        'gpnChnrouteForeign': "'Steered'",
    },
    'zh': {
        'gpnDnsCard': "'5gpn DNS'",
        'gpnQps': "'每秒查询'",
        'gpnCacheHitRate': "'缓存命中率'",
        'gpnCacheEntries': "'条目'",
        'gpnDecisionMix': "'决策分布'",
        'gpnUpstreamHealth': "'上游健康'",
        'gpnChnrouteCn': "'国内直连'",
        'gpnChnrouteForeign': "'引导入网关'",
    },
    'zh-tw': {
        'gpnDnsCard': "'5gpn DNS'",
        'gpnQps': "'每秒查詢'",
        'gpnCacheHitRate': "'快取命中率'",
        'gpnCacheEntries': "'項目'",
        'gpnDecisionMix': "'決策分布'",
        'gpnUpstreamHealth': "'上游健康'",
        'gpnChnrouteCn': "'國內直連'",
        'gpnChnrouteForeign': "'導向閘道'",
    },
    'ru': {
        'gpnDnsCard': "'5gpn DNS'",
        'gpnQps': "'Запросов в секунду'",
        'gpnCacheHitRate': "'Попадания в кэш'",
        'gpnCacheEntries': "'записей'",
        'gpnDecisionMix': "'Распределение решений'",
        'gpnUpstreamHealth': "'Состояние апстримов'",
        'gpnChnrouteCn': "'Прямой (CN)'",
        'gpnChnrouteForeign': "'Через шлюз'",
    },
}

for loc, keys in KEYS.items():
    p = 'src/i18n/%s.ts' % loc
    raw = io.open(p, encoding='utf-8', newline='').read()
    nl = '\r\n' if '\r\n' in raw else '\n'
    lines = raw.split(nl)
    idx = [i for i, l in enumerate(lines) if l.strip().startswith('gpnQueriesTotal:')]
    assert len(idx) == 1, '%s: anchor matched %d' % (p, len(idx))
    a = lines[idx[0]]
    ind = a[: len(a) - len(a.lstrip())]
    add = ['%s%s: %s,' % (ind, k, v) for k, v in keys.items() if ('%s:' % k) not in raw]
    lines[idx[0] + 1 : idx[0] + 1] = add
    io.open(p, 'w', encoding='utf-8', newline='').write(nl.join(lines))
    print('%s: +%d' % (p, len(add)))
