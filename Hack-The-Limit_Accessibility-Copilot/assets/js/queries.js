/* ==========================================================================
   Author queries: what the Copilot could not fix, said out loud.

   A proofreader who finds something only the writer can fix raises an author
   query. This is that, for a web page. Two lists, kept apart on purpose:

     blocked  the Copilot will not touch these, and says why
     covered  the Copilot can paper over these, and the page is still broken

   Every check runs in the page with no library. None of this is an audit,
   and the copy never pretends otherwise.
   ========================================================================== */

(function () {
  'use strict';

  var MAX_NODES = 4000;

  /* --- Small helpers ---------------------------------------------------- */

  function visible(el) {
    if (!el || !el.getBoundingClientRect) return false;
    var cs = getComputedStyle(el);
    if (cs.display === 'none' || cs.visibility === 'hidden') return false;
    if (parseFloat(cs.opacity) === 0) return false;
    var r = el.getBoundingClientRect();
    if (r.width <= 1 && r.height <= 1) return false;      /* the visually-hidden pattern */
    if ((cs.clipPath || '').indexOf('inset(50%') === 0) return false;
    return true;
  }

  function hiddenFromScreenReaders(el) {
    return !!el.closest('[aria-hidden="true"]');
  }

  /* A heading parked off screen for screen readers is still a heading, and
     screen reader users are exactly who the heading outline is for. So this
     asks whether a thing is announced, not whether it can be seen. */
  function announced(el) {
    if (hiddenFromScreenReaders(el)) return false;
    var n = el;
    while (n && n.nodeType === 1) {
      var cs = getComputedStyle(n);
      if (cs.display === 'none' || cs.visibility === 'hidden') return false;
      n = n.parentElement;
    }
    return true;
  }

  function textOf(el) {
    return (el.textContent || '').replace(/\s+/g, ' ').trim();
  }

  /* A working accessible name, close enough to be useful and honest about it. */
  function accName(el, root) {
    var al = el.getAttribute('aria-label');
    if (al && al.trim()) return al.trim();

    var lb = el.getAttribute('aria-labelledby');
    if (lb) {
      var joined = lb.split(/\s+/).map(function (id) {
        var n = document.getElementById(id);
        return n ? textOf(n) : '';
      }).join(' ').trim();
      if (joined) return joined;
    }

    var tag = el.tagName.toLowerCase();

    if (tag === 'input' || tag === 'select' || tag === 'textarea') {
      if (el.id) {
        var esc = window.CSS && CSS.escape ? CSS.escape(el.id) : el.id.replace(/"/g, '\\"');
        var lab = (root || document).querySelector('label[for="' + esc + '"]');
        if (lab && textOf(lab)) return textOf(lab);
      }
      var wrap = el.closest('label');
      if (wrap && textOf(wrap)) return textOf(wrap);
      if (el.type === 'submit' || el.type === 'button' || el.type === 'reset') {
        if ((el.value || '').trim()) return el.value.trim();
      }
      var ti = el.getAttribute('title');
      return ti && ti.trim() ? ti.trim() : '';
    }

    var t = textOf(el);
    if (t) return t;

    var img = el.querySelector('img[alt]');
    if (img && img.alt.trim()) return img.alt.trim();
    var st = el.querySelector('svg title');
    if (st && textOf(st)) return textOf(st);
    var title = el.getAttribute('title');
    return title && title.trim() ? title.trim() : '';
  }

  /* --- Contrast ---------------------------------------------------------- */

  /* Browsers serialise a color-mix() result as color(srgb 0.95 0.93 0.89 / 0.86),
     where the channels run 0 to 1 rather than 0 to 255. Reading those as 0-255
     turns a cream background into near-black and invents contrast failures.
     Anything in a space this cannot read honestly returns null and is skipped. */
  function rgb(str) {
    str = (str || '').trim();
    if (!str || str === 'transparent') return { r: 0, g: 0, b: 0, a: 0 };
    var scale = 1;
    if (/^color\(\s*srgb\b/i.test(str)) scale = 255;
    else if (!/^rgba?\(/i.test(str)) return null;
    var m = str.match(/[\d.]+/g);
    if (!m || m.length < 3) return null;
    return {
      r: +m[0] * scale, g: +m[1] * scale, b: +m[2] * scale,
      a: m.length > 3 ? parseFloat(m[3]) : 1
    };
  }

  function lum(c) {
    var f = function (v) { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); };
    return 0.2126 * f(c.r) + 0.7152 * f(c.g) + 0.0722 * f(c.b);
  }

  function ratio(a, b) {
    var x = lum(a), y = lum(b);
    return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05);
  }

  /* Walk up for the first background that actually paints. Backgrounds behind
     an image or a gradient are not measurable this way, so those are skipped
     rather than guessed at. */
  function backdrop(el) {
    var n = el;
    while (n && n.nodeType === 1) {
      var cs = getComputedStyle(n);
      if (cs.backgroundImage && cs.backgroundImage !== 'none') return null;
      var c = rgb(cs.backgroundColor);
      if (c && c.a >= 0.85) return c;
      n = n.parentElement;
    }
    return { r: 255, g: 255, b: 255, a: 1 };
  }

  function largeText(cs) {
    var size = parseFloat(cs.fontSize);
    var weight = parseInt(cs.fontWeight, 10) || 400;
    return size >= 24 || (size >= 18.66 && weight >= 700);
  }

  /* An element that holds its own words, rather than only wrapping others. */
  function ownsText(el) {
    for (var i = 0; i < el.childNodes.length; i++) {
      var n = el.childNodes[i];
      if (n.nodeType === 3 && n.nodeValue.trim().length > 1) return true;
    }
    return false;
  }

  /* --- The findings ------------------------------------------------------- */

  function plural(n, one, many) { return n + ' ' + (n === 1 ? one : many); }

  function scan(root) {
    root = root || document.body;
    var scope = root === document ? document.body : root;
    var all = Array.prototype.slice.call(scope.querySelectorAll('*'), 0, MAX_NODES);

    var blocked = [];
    var covered = [];

    function add(list, f) { if (f.nodes.length) list.push(f); }

    /* 1. Pictures with nothing said about them */
    var noAlt = all.filter(function (el) {
      return el.tagName === 'IMG' && !el.hasAttribute('alt') && visible(el);
    });
    add(blocked, {
      id: 'img-no-alt', nodes: noAlt,
      title: 'Pictures with no description',
      why: plural(noAlt.length, 'picture carries', 'pictures carry') + ' no description at all, so a screen reader can only say "image".',
      fix: 'Only the person who put the picture there knows what it shows. A made-up description is worse than none, so the Copilot writes nothing.'
    });

    /* 2. Controls a screen reader cannot read out */
    var unnamed = all.filter(function (el) {
      var tag = el.tagName.toLowerCase();
      var role = (el.getAttribute('role') || '').toLowerCase();
      var isControl = tag === 'button' || (tag === 'a' && el.hasAttribute('href')) ||
        role === 'button' || role === 'link';
      if (!isControl || !visible(el) || hiddenFromScreenReaders(el)) return false;
      return !accName(el, scope);
    });
    add(blocked, {
      id: 'name-missing', nodes: unnamed,
      title: 'Controls with no name',
      why: plural(unnamed.length, 'button or link has', 'buttons or links have') + ' nothing a screen reader can read out.',
      fix: 'The Copilot could guess from what sits nearby. A guess on a button that spends money is not a risk worth taking, so it leaves the naming to the author.'
    });

    /* 3. Links that say nothing out of context */
    var VAGUE = ['click here', 'read more', 'more', 'here', 'link', 'this', 'learn more', 'details', 'continue'];
    var vague = all.filter(function (el) {
      if (el.tagName !== 'A' || !el.hasAttribute('href') || !visible(el)) return false;
      var n = accName(el, scope).toLowerCase().replace(/[.…>»\s]+$/, '').trim();
      return VAGUE.indexOf(n) !== -1;
    });
    add(blocked, {
      id: 'vague-link', nodes: vague,
      title: 'Links that say nothing',
      why: plural(vague.length, 'link reads', 'links read') + ' as "read more" or something like it. Pulled out of the sentence around them, they say nothing about where they go.',
      fix: 'Rewriting a link can send somebody somewhere they did not expect. The Copilot never touches where a link points or what it promises.'
    });

    /* 4. A heading level skipped */
    var heads = all.filter(function (el) {
      return /^H[1-6]$/.test(el.tagName) && announced(el);
    });
    var skips = [], prev = 0, jump = null;
    heads.forEach(function (h) {
      var lvl = +h.tagName[1];
      if (prev && lvl > prev + 1) { skips.push(h); if (!jump) jump = prev + ' to H' + lvl; }
      prev = lvl;
    });
    add(blocked, {
      id: 'heading-skip', nodes: skips,
      title: 'A heading level skipped',
      why: 'The page jumps from H' + (jump || '') + '. Anyone moving through it by headings loses the shape of it.',
      fix: 'Renumbering headings changes what the page claims about itself. That is the author’s call, not a reading tool’s.'
    });

    /* 5. Fields leaning on placeholder text */
    var unlabelled = all.filter(function (el) {
      var tag = el.tagName.toLowerCase();
      if (tag !== 'input' && tag !== 'select' && tag !== 'textarea') return false;
      if (el.type === 'hidden' || el.type === 'submit' || el.type === 'button') return false;
      if (!visible(el)) return false;
      return !accName(el, scope);
    });
    add(blocked, {
      id: 'field-no-label', nodes: unlabelled,
      title: 'Form fields with no label',
      why: plural(unlabelled.length, 'field leans', 'fields lean') + ' on placeholder text, which disappears the moment you start typing.',
      fix: 'The Copilot will not name a field it might name wrongly, least of all one you are about to type into.'
    });

    /* 6. The page does not say what language it is in */
    var langMissing = (root === document || scope === document.body) && !document.documentElement.lang
      ? [document.documentElement] : [];
    add(blocked, {
      id: 'no-lang', nodes: langMissing,
      title: 'The page does not say what language it is in',
      why: 'A screen reader has to guess which voice to read it in, and it often guesses wrong.',
      fix: 'One attribute on one tag, and only the author can set it.'
    });

    /* 7. Hidden from screen readers, still in the tab order */
    var ghosts = all.filter(function (el) {
      if (!el.closest('[aria-hidden="true"]')) return false;
      var tag = el.tagName.toLowerCase();
      var focusable = tag === 'button' || tag === 'select' || tag === 'textarea' ||
        (tag === 'a' && el.hasAttribute('href')) ||
        (tag === 'input' && el.type !== 'hidden') ||
        (el.hasAttribute('tabindex') && el.getAttribute('tabindex') !== '-1');
      if (!focusable) return false;
      if (el.hasAttribute('tabindex') && el.getAttribute('tabindex') === '-1') return false;
      if (el.disabled) return false;
      return !el.closest('[inert]');
    });
    add(blocked, {
      id: 'ghost-focus', nodes: ghosts,
      title: 'Hidden from a screen reader, still reachable by keyboard',
      why: plural(ghosts.length, 'control is', 'controls are') + ' hidden from screen readers and still land in the tab order. Someone tabbing arrives somewhere their screen reader has nothing to say about.',
      fix: 'Pulling these back out changes how the page is built underneath. The Copilot does not rebuild pages.'
    });

    /* 8. Focus order forced out of shape */
    var forced = all.filter(function (el) {
      var t = parseInt(el.getAttribute('tabindex'), 10);
      return t > 0 && visible(el);
    });
    add(blocked, {
      id: 'positive-tabindex', nodes: forced,
      title: 'Focus order forced out of shape',
      why: plural(forced.length, 'control pulls itself', 'controls pull themselves') + ' out of the normal order with a positive tabindex, so tabbing jumps around the page.',
      fix: 'The Copilot never reorders controls. Moving one can change what a task means, and a changed task is worse than an awkward one.'
    });

    /* 9. Text under the contrast floor. The Copilot can lift this for you and
          the page still ships it under the floor for everybody else. */
    var lowContrast = [], worst = 99;
    all.forEach(function (el) {
      if (lowContrast.length > 60) return;
      if (!ownsText(el) || !visible(el) || hiddenFromScreenReaders(el)) return;
      var cs = getComputedStyle(el);
      var fg = rgb(cs.color);
      if (!fg || fg.a < 0.85) return;
      var bg = backdrop(el);
      if (!bg) return;
      var need = largeText(cs) ? 3 : 4.5;
      var r = ratio(fg, bg);
      if (r < need) { lowContrast.push(el); if (r < worst) worst = r; }
    });
    add(covered, {
      id: 'contrast', nodes: lowContrast,
      title: 'Text under the contrast floor',
      why: plural(lowContrast.length, 'piece', 'pieces') + ' of text sit below the readable minimum against what is behind them. The worst is ' + worst.toFixed(1) + ' to 1.',
      fix: 'High Contrast lifts these for you in a moment. It does nothing for the next person who arrives here without it.'
    });

    /* 10. Nowhere for a skip link to go */
    var hasMain = !!document.querySelector('main, [role="main"]');
    add(covered, {
      id: 'no-landmarks', nodes: hasMain ? [] : [document.body],
      title: 'No main region to skip to',
      why: 'Nothing on this page is marked as the main content, so "skip to content" has no target and a screen reader has no shortcut past the navigation.',
      fix: 'The Copilot adds a skip link and points it at its best guess at where the content starts. A guess is not the same as the author saying so.'
    });

    /* 11. Targets smaller than a fingertip */
    var tiny = all.filter(function (el) {
      var tag = el.tagName.toLowerCase();
      var isControl = tag === 'button' || (tag === 'a' && el.hasAttribute('href')) ||
        (tag === 'input' && el.type !== 'hidden');
      if (!isControl || !visible(el)) return false;
      if (el.closest('p, li, td')) return false;          /* links inside a sentence are exempt */
      var r = el.getBoundingClientRect();
      return r.width < 24 || r.height < 24;
    });
    add(covered, {
      id: 'small-target', nodes: tiny,
      title: 'Controls smaller than a fingertip',
      why: plural(tiny.length, 'control is', 'controls are') + ' under 24 pixels across. Hard to hit with a thumb, harder with a tremor.',
      fix: 'The Copilot can pad the area you press without moving anything. It cannot rebuild a layout that was drawn around them.'
    });

    /* 12. Media that starts itself */
    var autos = all.filter(function (el) {
      return (el.tagName === 'VIDEO' || el.tagName === 'AUDIO') && el.autoplay;
    });
    add(covered, {
      id: 'autoplay', nodes: autos,
      title: 'Media that starts itself',
      why: plural(autos.length, 'item starts', 'items start') + ' playing without being asked.',
      fix: 'Low Motion stops them here. They still start for everybody who arrives without it.'
    });

    return {
      blocked: blocked,
      covered: covered,
      count: blocked.length + covered.length,
      items: blocked.reduce(function (a, f) { return a + f.nodes.length; }, 0) +
             covered.reduce(function (a, f) { return a + f.nodes.length; }, 0),
      scanned: all.length
    };
  }

  /* --- Showing the reader where ------------------------------------------- */

  var marked = [];

  function clearMarks() {
    marked.forEach(function (el) { el.removeAttribute('data-acp-query'); });
    marked = [];
  }

  function markNodes(nodes) {
    clearMarks();
    nodes.forEach(function (el) {
      if (!el || !el.setAttribute) return;
      el.setAttribute('data-acp-query', '');
      marked.push(el);
    });
    if (nodes[0] && nodes[0].scrollIntoView) {
      nodes[0].scrollIntoView({ block: 'center', behavior: 'smooth' });
    }
    return nodes.length;
  }

  /* --- The panel markup, shared by the rail and the demo -------------------- */

  function group(title, note, findings) {
    if (!findings.length) return '';
    return '<h3 class="cp-qh">' + title + '</h3><p class="cp-qnote">' + note + '</p>' +
      findings.map(function (f) {
        return '<div class="cp-q"><button type="button" class="cp-qbtn" aria-pressed="false" data-q="' + f.id + '">' +
          '<span class="cp-qt">' + f.title + '</span>' +
          '<span class="cp-qn">' + f.nodes.length + '</span></button>' +
          '<p class="cp-qwhy">' + f.why + '</p>' +
          '<p class="cp-qfix">' + f.fix + '</p></div>';
      }).join('');
  }

  function html(result, noun) {
    noun = noun || 'this page';
    if (!result || !result.count) {
      return '<p class="cp-empty">Nothing found on ' + noun + '. That is the least anyone ' +
        'is owed, not an achievement, and this check only knows how to look for a ' +
        'dozen things.</p>';
    }
    return '<p class="cp-qsum">' + result.items + ' thing' + (result.items === 1 ? '' : 's') +
      ' across ' + result.scanned + ' elements on ' + noun + '.</p>' +
      group('The Copilot will not touch these',
        'Fixing any of them means guessing at what somebody meant, and a wrong guess is worse than the problem.',
        result.blocked) +
      group('The Copilot can cover these',
        'It can make them bearable for you. The page is still broken underneath, for everyone who arrives without it.',
        result.covered);
  }

  function find(result, id) {
    var all = result.blocked.concat(result.covered);
    for (var i = 0; i < all.length; i++) if (all[i].id === id) return all[i];
    return null;
  }

  window.CopilotQueries = {
    scan: scan, mark: markNodes, clear: clearMarks, html: html, find: find
  };
})();
