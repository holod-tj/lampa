(function () {
    'use strict';

    if (window.mixtj_plugin_ready) return;
    window.mixtj_plugin_ready = true;

    var BASE = 'https://mix.tj';
    var network = new Lampa.Reguest();

    // Запрос HTML-страницы (native на Android обходит CORS)
    function getText(url, ok, fail) {
        var fn = network.native ? network.native.bind(network) : network.silent.bind(network);
        fn(url, function (res) {
            ok(typeof res === 'string' ? res : JSON.stringify(res));
        }, function () {
            fail && fail();
        }, false, { dataType: 'text' });
    }

    function searchUrl(query) {
        return BASE + '/index.php?do=poisk&s=' + encodeURIComponent(query) + '&so=0&st=0&sd=0&sc=0';
    }

    // Разбор результатов поиска: все ссылки вида /video/123.html
    function parseResults(html) {
        var doc = new DOMParser().parseFromString(html, 'text/html');
        var links = doc.querySelectorAll('a[href*="/video/"]');
        var seen = {}, items = [];

        for (var i = 0; i < links.length; i++) {
            var a = links[i];
            var href = a.getAttribute('href') || '';
            var m = href.match(/\/video\/(\d+)\.html/);
            if (!m) continue;

            var title = (a.getAttribute('title') || a.textContent || '').replace(/\s+/g, ' ').trim();
            if (!title || title.length < 3) continue;

            var id = m[1];
            if (seen[id]) {
                if (title.length > seen[id].title.length) seen[id].title = title;
                continue;
            }
            seen[id] = { id: id, title: title, url: BASE + '/video/' + id + '.html' };
            items.push(seen[id]);
        }
        return items;
    }

    // Поиск прямой ссылки на видео на странице фильма
    function extractVideo(html) {
        var m = html.match(/https?:\/\/[^"'\s<>]+\.(mp4|m3u8)(\?[^"'\s<>]*)?/i);
        return m ? m[0] : '';
    }

    function norm(s) {
        return (s || '').toLowerCase().replace(/ё/g, 'е').replace(/[^a-zа-я0-9]/gi, '');
    }

    // Сортировка: сначала совпадение по названию и году
    function rank(items, movie) {
        var year = ((movie.release_date || movie.first_air_date || '') + '').slice(0, 4);
        var t1 = norm(movie.title || movie.name);
        var t2 = norm(movie.original_title || movie.original_name);

        items.forEach(function (it) {
            var t = norm(it.title), score = 0;
            if (t1 && t.indexOf(t1) >= 0) score += 2;
            if (t2 && t.indexOf(t2) >= 0) score += 2;
            if (year && it.title.indexOf(year) >= 0) score += 1;
            it.score = score;
        });

        return items.sort(function (a, b) { return b.score - a.score; });
    }

    function play(item) {
        Lampa.Loading.start(function () { network.clear(); Lampa.Loading.stop(); });
        getText(item.url, function (html) {
            Lampa.Loading.stop();
            var video = extractVideo(html);
            if (!video) return Lampa.Noty.show('MIX.tj: ссылка на видео не найдена');

            var data = { title: item.title, url: video };
            Lampa.Player.play(data);
            Lampa.Player.playlist([data]);
        }, function () {
            Lampa.Loading.stop();
            Lampa.Noty.show('MIX.tj: не удалось открыть страницу');
        });
    }

    function showList(items) {
        Lampa.Select.show({
            title: 'MIX.tj',
            items: items.map(function (it) { return { title: it.title, item: it }; }),
            onSelect: function (a) { play(a.item); },
            onBack: function () { Lampa.Controller.toggle('full_start'); }
        });
    }

    function search(movie) {
        var queries = [movie.title || movie.name, movie.original_title || movie.original_name]
            .filter(function (q, i, arr) { return q && arr.indexOf(q) === i; });

        Lampa.Loading.start(function () { network.clear(); Lampa.Loading.stop(); });

        (function next(i) {
            if (i >= queries.length) {
                Lampa.Loading.stop();
                return Lampa.Noty.show('MIX.tj: фильм не найден');
            }
            getText(searchUrl(queries[i]), function (html) {
                var items = parseResults(html);
                if (!items.length) return next(i + 1);
                Lampa.Loading.stop();
                showList(rank(items, movie).slice(0, 40));
            }, function () { next(i + 1); });
        })(0);
    }

    // Кнопка «MIX.tj» в карточке фильма
    Lampa.Listener.follow('full', function (e) {
        if (e.type !== 'complite') return;

        var render = e.object.activity.render();
        if (render.find('.mixtj--button').length) return;

        var btn = $('<div class="full-start__button selector mixtj--button">' +
            '<svg viewBox="0 0 24 24" width="24" height="24"><path fill="currentColor" d="M8 5v14l11-7z"/></svg>' +
            '<span>MIX.tj</span></div>');

        btn.on('hover:enter', function () { search(e.data.movie); });

        var anchor = render.find('.view--torrent');
        if (anchor.length) anchor.after(btn);
        else render.find('.full-start-new__buttons, .full-start__buttons').append(btn);
    });
})();
