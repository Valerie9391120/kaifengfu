// =====================================================
// 手帐上的天气：Open-Meteo（免费，不用钥匙），在手机上取。只把城市的经纬度和那一天寄过去，别的什么都不寄。
// 在哪儿是她在手帐里自己填的（kfs2:jzcfg，加密了跟着云端走），仓库里不写城市；没填就不取，天气那一块不摆（同页的规矩：没有的不编）。
//   geocode(名字)     找城市：[{ name, lat, lon, tz, where }]
//   dayWeather(城市, 日子)  那一天的天气：{ code, hi, lo, mm, wind, sun, city, src }（wind 是最大风速 km/h，sun 是日落几点），取不到抛错
// 近两个月以内的走预报那个接口（它带着过去九十天），更早的走历史那个（它要晚几天才有）；一个不行换另一个
// =====================================================
export const WX_HOSTS = ["https://geocoding-api.open-meteo.com", "https://api.open-meteo.com", "https://archive-api.open-meteo.com"];

const get = async (url, fetcher) => {
  const r = await fetcher(url);
  if (!r.ok) throw new Error(`天气那边回了 ${r.status}`);
  return r.json();
};

export async function geocode(name, fetcher = fetch) {
  const q = String(name || "").trim();
  if (!q) return [];
  const d = await get(`${WX_HOSTS[0]}/v1/search?name=${encodeURIComponent(q)}&count=6&language=zh&format=json`, fetcher);
  return (d.results || []).map((x) => ({
    name: x.name,
    lat: Math.round(x.latitude * 100) / 100,
    lon: Math.round(x.longitude * 100) / 100,
    tz: x.timezone || "auto",
    where: [x.admin1, x.country].filter(Boolean).join("，"),
  }));
}

export async function dayWeather(city, day, fetcher = fetch, now = new Date()) {
  if (!city || !Number.isFinite(city.lat) || !Number.isFinite(city.lon)) throw new Error("还没填天气在哪儿");
  // 风、日落是同页的天气签、天气贴纸上要的（10 月 18 日搬同页进来时添的）
  const q = `latitude=${city.lat}&longitude=${city.lon}&daily=weather_code,temperature_2m_max,temperature_2m_min,precipitation_sum,wind_speed_10m_max,sunset&timezone=${encodeURIComponent(city.tz || "auto")}&start_date=${day}&end_date=${day}`;
  const ago = (now - new Date(`${day}T12:00:00`)) / 86400000;
  const order = ago <= 60 ? [WX_HOSTS[1] + "/v1/forecast", WX_HOSTS[2] + "/v1/archive"] : [WX_HOSTS[2] + "/v1/archive", WX_HOSTS[1] + "/v1/forecast"];
  let last = null;
  for (const base of order) {
    try {
      const d = await get(`${base}?${q}`, fetcher);
      const dl = d.daily || {};
      const code = (dl.weather_code || [])[0];
      if (code === null || code === undefined) throw new Error("那一天还没有天气");
      return {
        code: Number(code),
        hi: Number((dl.temperature_2m_max || [])[0]),
        lo: Number((dl.temperature_2m_min || [])[0]),
        mm: Number((dl.precipitation_sum || [])[0]) || 0,
        wind: Number((dl.wind_speed_10m_max || [])[0]),
        sun: /T(\d\d:\d\d)/.exec(String((dl.sunset || [])[0] || "")) ? /T(\d\d:\d\d)/.exec(String(dl.sunset[0]))[1] : "",
        city: city.name,
        src: "open-meteo",
      };
    } catch (e) {
      last = e;
    }
  }
  throw last || new Error("没取到天气");
}
