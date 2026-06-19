"use strict";
(() => {
  // lib/chunk.ts
  var TARGET_WORDS = 150;
  function blockId(index) {
    return `block-${index}`;
  }
  function countWords(s) {
    return s.split(/\s+/).filter(Boolean).length;
  }
  function chunkBlocks(blocks) {
    const chunks = [];
    let heading = "";
    let buf = [];
    let bufWords = 0;
    const flush = () => {
      if (buf.length === 0) return;
      chunks.push({
        id: chunks.length,
        text: buf.map((b) => b.text).join("\n"),
        blockIds: buf.map((b) => b.id),
        anchorId: buf[0].id,
        heading,
        wordCount: bufWords
      });
      buf = [];
      bufWords = 0;
    };
    blocks.forEach((block, i) => {
      if (block.type === "h2") {
        flush();
        heading = block.text;
        return;
      }
      const words = countWords(block.text);
      if (bufWords > 0 && bufWords + words > TARGET_WORDS * 1.3) {
        flush();
      }
      buf.push({ text: block.text, id: blockId(i) });
      bufWords += words;
      if (bufWords >= TARGET_WORDS) flush();
    });
    flush();
    return chunks;
  }
  function hashText(text) {
    let h2 = 5381;
    for (let i = 0; i < text.length; i++) {
      h2 = (h2 << 5) + h2 + text.charCodeAt(i) | 0;
    }
    return (h2 >>> 0).toString(36);
  }

  // extension/extractor.ts
  var INLINE_TAGS = /* @__PURE__ */ new Set([
    "A",
    "SPAN",
    "B",
    "STRONG",
    "I",
    "EM",
    "U",
    "S",
    "SMALL",
    "SUB",
    "SUP",
    "MARK",
    "ABBR",
    "TIME",
    "CITE",
    "Q",
    "CODE",
    "KBD",
    "SAMP",
    "VAR",
    "BDI",
    "BDO",
    "DFN",
    "DATA",
    "INS",
    "DEL",
    "FONT",
    "TT",
    "NOBR",
    "RUBY",
    "RT",
    "RP",
    "WBR",
    "BR"
  ]);
  var SKIP_TAGS = /* @__PURE__ */ new Set([
    "SCRIPT",
    "STYLE",
    "NOSCRIPT",
    "TEMPLATE",
    "HEAD",
    "META",
    "LINK",
    "TITLE",
    "SVG",
    "CANVAS",
    "IFRAME",
    "OBJECT",
    "EMBED",
    "AUDIO",
    "VIDEO",
    "MAP",
    "SELECT",
    "OPTION",
    "DATALIST",
    "TEXTAREA",
    "PROGRESS",
    "METER"
  ]);
  var HEADING_TAGS = /* @__PURE__ */ new Set(["H1", "H2", "H3", "H4", "H5", "H6"]);
  function isHidden(el) {
    const style = window.getComputedStyle(el);
    if (style.display === "none" || style.visibility === "hidden" || style.visibility === "collapse" || Number(style.opacity) === 0) {
      return true;
    }
    const rect = el.getBoundingClientRect();
    return rect.width === 0 && rect.height === 0;
  }
  function ownFlowText(el) {
    let out = "";
    for (const node of Array.from(el.childNodes)) {
      if (node.nodeType === Node.TEXT_NODE) {
        out += node.nodeValue ?? "";
      } else if (node.nodeType === Node.ELEMENT_NODE) {
        const child = node;
        if (INLINE_TAGS.has(child.tagName)) {
          out += child.textContent ?? "";
        }
      }
    }
    return out.replace(/\s+/g, " ").trim();
  }
  function extractBlocks(root = document) {
    const scope = root.body ?? root;
    const blocks = [];
    const elementById = /* @__PURE__ */ new Map();
    for (const el of Array.from(scope.querySelectorAll("*"))) {
      if (SKIP_TAGS.has(el.tagName) || INLINE_TAGS.has(el.tagName)) continue;
      if (el.closest("#semantic-find-extension-root")) continue;
      const text = ownFlowText(el);
      if (!text) continue;
      if (isHidden(el)) continue;
      const i = blocks.length;
      blocks.push({ type: HEADING_TAGS.has(el.tagName) ? "h2" : "p", text });
      elementById.set(blockId(i), el);
    }
    return { blocks, elementById };
  }

  // node_modules/minisearch/dist/es/index.js
  var ENTRIES = "ENTRIES";
  var KEYS = "KEYS";
  var VALUES = "VALUES";
  var LEAF = "";
  var TreeIterator = class {
    constructor(set, type) {
      const node = set._tree;
      const keys = Array.from(node.keys());
      this.set = set;
      this._type = type;
      this._path = keys.length > 0 ? [{ node, keys }] : [];
    }
    next() {
      const value = this.dive();
      this.backtrack();
      return value;
    }
    dive() {
      if (this._path.length === 0) {
        return { done: true, value: void 0 };
      }
      const { node, keys } = last$1(this._path);
      if (last$1(keys) === LEAF) {
        return { done: false, value: this.result() };
      }
      const child = node.get(last$1(keys));
      this._path.push({ node: child, keys: Array.from(child.keys()) });
      return this.dive();
    }
    backtrack() {
      if (this._path.length === 0) {
        return;
      }
      const keys = last$1(this._path).keys;
      keys.pop();
      if (keys.length > 0) {
        return;
      }
      this._path.pop();
      this.backtrack();
    }
    key() {
      return this.set._prefix + this._path.map(({ keys }) => last$1(keys)).filter((key) => key !== LEAF).join("");
    }
    value() {
      return last$1(this._path).node.get(LEAF);
    }
    result() {
      switch (this._type) {
        case VALUES:
          return this.value();
        case KEYS:
          return this.key();
        default:
          return [this.key(), this.value()];
      }
    }
    [Symbol.iterator]() {
      return this;
    }
  };
  var last$1 = (array) => {
    return array[array.length - 1];
  };
  var fuzzySearch = (node, query, maxDistance) => {
    const results = /* @__PURE__ */ new Map();
    if (query === void 0)
      return results;
    const n = query.length + 1;
    const m = n + maxDistance;
    const matrix = new Uint8Array(m * n).fill(maxDistance + 1);
    for (let j = 0; j < n; ++j)
      matrix[j] = j;
    for (let i = 1; i < m; ++i)
      matrix[i * n] = i;
    recurse(node, query, maxDistance, results, matrix, 1, n, "");
    return results;
  };
  var recurse = (node, query, maxDistance, results, matrix, m, n, prefix) => {
    const offset = m * n;
    key: for (const key of node.keys()) {
      if (key === LEAF) {
        const distance = matrix[offset - 1];
        if (distance <= maxDistance) {
          results.set(prefix, [node.get(key), distance]);
        }
      } else {
        let i = m;
        for (let pos = 0; pos < key.length; ++pos, ++i) {
          const char = key[pos];
          const thisRowOffset = n * i;
          const prevRowOffset = thisRowOffset - n;
          let minDistance = matrix[thisRowOffset];
          const jmin = Math.max(0, i - maxDistance - 1);
          const jmax = Math.min(n - 1, i + maxDistance);
          for (let j = jmin; j < jmax; ++j) {
            const different = char !== query[j];
            const rpl = matrix[prevRowOffset + j] + +different;
            const del = matrix[prevRowOffset + j + 1] + 1;
            const ins = matrix[thisRowOffset + j] + 1;
            const dist = matrix[thisRowOffset + j + 1] = Math.min(rpl, del, ins);
            if (dist < minDistance)
              minDistance = dist;
          }
          if (minDistance > maxDistance) {
            continue key;
          }
        }
        recurse(node.get(key), query, maxDistance, results, matrix, i, n, prefix + key);
      }
    }
  };
  var SearchableMap = class _SearchableMap {
    /**
     * The constructor is normally called without arguments, creating an empty
     * map. In order to create a {@link SearchableMap} from an iterable or from an
     * object, check {@link SearchableMap.from} and {@link
     * SearchableMap.fromObject}.
     *
     * The constructor arguments are for internal use, when creating derived
     * mutable views of a map at a prefix.
     */
    constructor(tree = /* @__PURE__ */ new Map(), prefix = "") {
      this._size = void 0;
      this._tree = tree;
      this._prefix = prefix;
    }
    /**
     * Creates and returns a mutable view of this {@link SearchableMap},
     * containing only entries that share the given prefix.
     *
     * ### Usage:
     *
     * ```javascript
     * let map = new SearchableMap()
     * map.set("unicorn", 1)
     * map.set("universe", 2)
     * map.set("university", 3)
     * map.set("unique", 4)
     * map.set("hello", 5)
     *
     * let uni = map.atPrefix("uni")
     * uni.get("unique") // => 4
     * uni.get("unicorn") // => 1
     * uni.get("hello") // => undefined
     *
     * let univer = map.atPrefix("univer")
     * univer.get("unique") // => undefined
     * univer.get("universe") // => 2
     * univer.get("university") // => 3
     * ```
     *
     * @param prefix  The prefix
     * @return A {@link SearchableMap} representing a mutable view of the original
     * Map at the given prefix
     */
    atPrefix(prefix) {
      if (!prefix.startsWith(this._prefix)) {
        throw new Error("Mismatched prefix");
      }
      const [node, path] = trackDown(this._tree, prefix.slice(this._prefix.length));
      if (node === void 0) {
        const [parentNode, key] = last(path);
        for (const k of parentNode.keys()) {
          if (k !== LEAF && k.startsWith(key)) {
            const node2 = /* @__PURE__ */ new Map();
            node2.set(k.slice(key.length), parentNode.get(k));
            return new _SearchableMap(node2, prefix);
          }
        }
      }
      return new _SearchableMap(node, prefix);
    }
    /**
     * @see https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Map/clear
     */
    clear() {
      this._size = void 0;
      this._tree.clear();
    }
    /**
     * @see https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Map/delete
     * @param key  Key to delete
     */
    delete(key) {
      this._size = void 0;
      return remove(this._tree, key);
    }
    /**
     * @see https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Map/entries
     * @return An iterator iterating through `[key, value]` entries.
     */
    entries() {
      return new TreeIterator(this, ENTRIES);
    }
    /**
     * @see https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Map/forEach
     * @param fn  Iteration function
     */
    forEach(fn) {
      for (const [key, value] of this) {
        fn(key, value, this);
      }
    }
    /**
     * Returns a Map of all the entries that have a key within the given edit
     * distance from the search key. The keys of the returned Map are the matching
     * keys, while the values are two-element arrays where the first element is
     * the value associated to the key, and the second is the edit distance of the
     * key to the search key.
     *
     * ### Usage:
     *
     * ```javascript
     * let map = new SearchableMap()
     * map.set('hello', 'world')
     * map.set('hell', 'yeah')
     * map.set('ciao', 'mondo')
     *
     * // Get all entries that match the key 'hallo' with a maximum edit distance of 2
     * map.fuzzyGet('hallo', 2)
     * // => Map(2) { 'hello' => ['world', 1], 'hell' => ['yeah', 2] }
     *
     * // In the example, the "hello" key has value "world" and edit distance of 1
     * // (change "e" to "a"), the key "hell" has value "yeah" and edit distance of 2
     * // (change "e" to "a", delete "o")
     * ```
     *
     * @param key  The search key
     * @param maxEditDistance  The maximum edit distance (Levenshtein)
     * @return A Map of the matching keys to their value and edit distance
     */
    fuzzyGet(key, maxEditDistance) {
      return fuzzySearch(this._tree, key, maxEditDistance);
    }
    /**
     * @see https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Map/get
     * @param key  Key to get
     * @return Value associated to the key, or `undefined` if the key is not
     * found.
     */
    get(key) {
      const node = lookup(this._tree, key);
      return node !== void 0 ? node.get(LEAF) : void 0;
    }
    /**
     * @see https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Map/has
     * @param key  Key
     * @return True if the key is in the map, false otherwise
     */
    has(key) {
      const node = lookup(this._tree, key);
      return node !== void 0 && node.has(LEAF);
    }
    /**
     * @see https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Map/keys
     * @return An `Iterable` iterating through keys
     */
    keys() {
      return new TreeIterator(this, KEYS);
    }
    /**
     * @see https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Map/set
     * @param key  Key to set
     * @param value  Value to associate to the key
     * @return The {@link SearchableMap} itself, to allow chaining
     */
    set(key, value) {
      if (typeof key !== "string") {
        throw new Error("key must be a string");
      }
      this._size = void 0;
      const node = createPath(this._tree, key);
      node.set(LEAF, value);
      return this;
    }
    /**
     * @see https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Map/size
     */
    get size() {
      if (this._size) {
        return this._size;
      }
      this._size = 0;
      const iter = this.entries();
      while (!iter.next().done)
        this._size += 1;
      return this._size;
    }
    /**
     * Updates the value at the given key using the provided function. The function
     * is called with the current value at the key, and its return value is used as
     * the new value to be set.
     *
     * ### Example:
     *
     * ```javascript
     * // Increment the current value by one
     * searchableMap.update('somekey', (currentValue) => currentValue == null ? 0 : currentValue + 1)
     * ```
     *
     * If the value at the given key is or will be an object, it might not require
     * re-assignment. In that case it is better to use `fetch()`, because it is
     * faster.
     *
     * @param key  The key to update
     * @param fn  The function used to compute the new value from the current one
     * @return The {@link SearchableMap} itself, to allow chaining
     */
    update(key, fn) {
      if (typeof key !== "string") {
        throw new Error("key must be a string");
      }
      this._size = void 0;
      const node = createPath(this._tree, key);
      node.set(LEAF, fn(node.get(LEAF)));
      return this;
    }
    /**
     * Fetches the value of the given key. If the value does not exist, calls the
     * given function to create a new value, which is inserted at the given key
     * and subsequently returned.
     *
     * ### Example:
     *
     * ```javascript
     * const map = searchableMap.fetch('somekey', () => new Map())
     * map.set('foo', 'bar')
     * ```
     *
     * @param key  The key to update
     * @param initial  A function that creates a new value if the key does not exist
     * @return The existing or new value at the given key
     */
    fetch(key, initial) {
      if (typeof key !== "string") {
        throw new Error("key must be a string");
      }
      this._size = void 0;
      const node = createPath(this._tree, key);
      let value = node.get(LEAF);
      if (value === void 0) {
        node.set(LEAF, value = initial());
      }
      return value;
    }
    /**
     * @see https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Map/values
     * @return An `Iterable` iterating through values.
     */
    values() {
      return new TreeIterator(this, VALUES);
    }
    /**
     * @see https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Map/@@iterator
     */
    [Symbol.iterator]() {
      return this.entries();
    }
    /**
     * Creates a {@link SearchableMap} from an `Iterable` of entries
     *
     * @param entries  Entries to be inserted in the {@link SearchableMap}
     * @return A new {@link SearchableMap} with the given entries
     */
    static from(entries) {
      const tree = new _SearchableMap();
      for (const [key, value] of entries) {
        tree.set(key, value);
      }
      return tree;
    }
    /**
     * Creates a {@link SearchableMap} from the iterable properties of a JavaScript object
     *
     * @param object  Object of entries for the {@link SearchableMap}
     * @return A new {@link SearchableMap} with the given entries
     */
    static fromObject(object) {
      return _SearchableMap.from(Object.entries(object));
    }
  };
  var trackDown = (tree, key, path = []) => {
    if (key.length === 0 || tree == null) {
      return [tree, path];
    }
    for (const k of tree.keys()) {
      if (k !== LEAF && key.startsWith(k)) {
        path.push([tree, k]);
        return trackDown(tree.get(k), key.slice(k.length), path);
      }
    }
    path.push([tree, key]);
    return trackDown(void 0, "", path);
  };
  var lookup = (tree, key) => {
    if (key.length === 0 || tree == null) {
      return tree;
    }
    for (const k of tree.keys()) {
      if (k !== LEAF && key.startsWith(k)) {
        return lookup(tree.get(k), key.slice(k.length));
      }
    }
  };
  var createPath = (node, key) => {
    const keyLength = key.length;
    outer: for (let pos = 0; node && pos < keyLength; ) {
      for (const k of node.keys()) {
        if (k !== LEAF && key[pos] === k[0]) {
          const len = Math.min(keyLength - pos, k.length);
          let offset = 1;
          while (offset < len && key[pos + offset] === k[offset])
            ++offset;
          const child2 = node.get(k);
          if (offset === k.length) {
            node = child2;
          } else {
            const intermediate = /* @__PURE__ */ new Map();
            intermediate.set(k.slice(offset), child2);
            node.set(key.slice(pos, pos + offset), intermediate);
            node.delete(k);
            node = intermediate;
          }
          pos += offset;
          continue outer;
        }
      }
      const child = /* @__PURE__ */ new Map();
      node.set(key.slice(pos), child);
      return child;
    }
    return node;
  };
  var remove = (tree, key) => {
    const [node, path] = trackDown(tree, key);
    if (node === void 0) {
      return;
    }
    node.delete(LEAF);
    if (node.size === 0) {
      cleanup(path);
    } else if (node.size === 1) {
      const [key2, value] = node.entries().next().value;
      merge(path, key2, value);
    }
  };
  var cleanup = (path) => {
    if (path.length === 0) {
      return;
    }
    const [node, key] = last(path);
    node.delete(key);
    if (node.size === 0) {
      cleanup(path.slice(0, -1));
    } else if (node.size === 1) {
      const [key2, value] = node.entries().next().value;
      if (key2 !== LEAF) {
        merge(path.slice(0, -1), key2, value);
      }
    }
  };
  var merge = (path, key, value) => {
    if (path.length === 0) {
      return;
    }
    const [node, nodeKey] = last(path);
    node.set(nodeKey + key, value);
    node.delete(nodeKey);
  };
  var last = (array) => {
    return array[array.length - 1];
  };
  var OR = "or";
  var AND = "and";
  var AND_NOT = "and_not";
  var MiniSearch = class _MiniSearch {
    /**
     * @param options  Configuration options
     *
     * ### Examples:
     *
     * ```javascript
     * // Create a search engine that indexes the 'title' and 'text' fields of your
     * // documents:
     * const miniSearch = new MiniSearch({ fields: ['title', 'text'] })
     * ```
     *
     * ### ID Field:
     *
     * ```javascript
     * // Your documents are assumed to include a unique 'id' field, but if you want
     * // to use a different field for document identification, you can set the
     * // 'idField' option:
     * const miniSearch = new MiniSearch({ idField: 'key', fields: ['title', 'text'] })
     * ```
     *
     * ### Options and defaults:
     *
     * ```javascript
     * // The full set of options (here with their default value) is:
     * const miniSearch = new MiniSearch({
     *   // idField: field that uniquely identifies a document
     *   idField: 'id',
     *
     *   // extractField: function used to get the value of a field in a document.
     *   // By default, it assumes the document is a flat object with field names as
     *   // property keys and field values as string property values, but custom logic
     *   // can be implemented by setting this option to a custom extractor function.
     *   extractField: (document, fieldName) => document[fieldName],
     *
     *   // tokenize: function used to split fields into individual terms. By
     *   // default, it is also used to tokenize search queries, unless a specific
     *   // `tokenize` search option is supplied. When tokenizing an indexed field,
     *   // the field name is passed as the second argument.
     *   tokenize: (string, _fieldName) => string.split(SPACE_OR_PUNCTUATION),
     *
     *   // processTerm: function used to process each tokenized term before
     *   // indexing. It can be used for stemming and normalization. Return a falsy
     *   // value in order to discard a term. By default, it is also used to process
     *   // search queries, unless a specific `processTerm` option is supplied as a
     *   // search option. When processing a term from a indexed field, the field
     *   // name is passed as the second argument.
     *   processTerm: (term, _fieldName) => term.toLowerCase(),
     *
     *   // searchOptions: default search options, see the `search` method for
     *   // details
     *   searchOptions: undefined,
     *
     *   // fields: document fields to be indexed. Mandatory, but not set by default
     *   fields: undefined
     *
     *   // storeFields: document fields to be stored and returned as part of the
     *   // search results.
     *   storeFields: []
     * })
     * ```
     */
    constructor(options) {
      if ((options === null || options === void 0 ? void 0 : options.fields) == null) {
        throw new Error('MiniSearch: option "fields" must be provided');
      }
      const autoVacuum = options.autoVacuum == null || options.autoVacuum === true ? defaultAutoVacuumOptions : options.autoVacuum;
      this._options = {
        ...defaultOptions,
        ...options,
        autoVacuum,
        searchOptions: { ...defaultSearchOptions, ...options.searchOptions || {} },
        autoSuggestOptions: { ...defaultAutoSuggestOptions, ...options.autoSuggestOptions || {} }
      };
      this._index = new SearchableMap();
      this._documentCount = 0;
      this._documentIds = /* @__PURE__ */ new Map();
      this._idToShortId = /* @__PURE__ */ new Map();
      this._fieldIds = {};
      this._fieldLength = /* @__PURE__ */ new Map();
      this._avgFieldLength = [];
      this._nextId = 0;
      this._storedFields = /* @__PURE__ */ new Map();
      this._dirtCount = 0;
      this._currentVacuum = null;
      this._enqueuedVacuum = null;
      this._enqueuedVacuumConditions = defaultVacuumConditions;
      this.addFields(this._options.fields);
    }
    /**
     * Adds a document to the index
     *
     * @param document  The document to be indexed
     */
    add(document2) {
      const { extractField, stringifyField, tokenize, processTerm: processTerm2, fields, idField } = this._options;
      const id = extractField(document2, idField);
      if (id == null) {
        throw new Error(`MiniSearch: document does not have ID field "${idField}"`);
      }
      if (this._idToShortId.has(id)) {
        throw new Error(`MiniSearch: duplicate ID ${id}`);
      }
      const shortDocumentId = this.addDocumentId(id);
      this.saveStoredFields(shortDocumentId, document2);
      for (const field of fields) {
        const fieldValue = extractField(document2, field);
        if (fieldValue == null)
          continue;
        const tokens = tokenize(stringifyField(fieldValue, field), field);
        const fieldId = this._fieldIds[field];
        const uniqueTerms = new Set(tokens).size;
        this.addFieldLength(shortDocumentId, fieldId, this._documentCount - 1, uniqueTerms);
        for (const term of tokens) {
          const processedTerm = processTerm2(term, field);
          if (Array.isArray(processedTerm)) {
            for (const t of processedTerm) {
              this.addTerm(fieldId, shortDocumentId, t);
            }
          } else if (processedTerm) {
            this.addTerm(fieldId, shortDocumentId, processedTerm);
          }
        }
      }
    }
    /**
     * Adds all the given documents to the index
     *
     * @param documents  An array of documents to be indexed
     */
    addAll(documents) {
      for (const document2 of documents)
        this.add(document2);
    }
    /**
     * Adds all the given documents to the index asynchronously.
     *
     * Returns a promise that resolves (to `undefined`) when the indexing is done.
     * This method is useful when index many documents, to avoid blocking the main
     * thread. The indexing is performed asynchronously and in chunks.
     *
     * @param documents  An array of documents to be indexed
     * @param options  Configuration options
     * @return A promise resolving to `undefined` when the indexing is done
     */
    addAllAsync(documents, options = {}) {
      const { chunkSize = 10 } = options;
      const acc = { chunk: [], promise: Promise.resolve() };
      const { chunk, promise } = documents.reduce(({ chunk: chunk2, promise: promise2 }, document2, i) => {
        chunk2.push(document2);
        if ((i + 1) % chunkSize === 0) {
          return {
            chunk: [],
            promise: promise2.then(() => new Promise((resolve) => setTimeout(resolve, 0))).then(() => this.addAll(chunk2))
          };
        } else {
          return { chunk: chunk2, promise: promise2 };
        }
      }, acc);
      return promise.then(() => this.addAll(chunk));
    }
    /**
     * Removes the given document from the index.
     *
     * The document to remove must NOT have changed between indexing and removal,
     * otherwise the index will be corrupted.
     *
     * This method requires passing the full document to be removed (not just the
     * ID), and immediately removes the document from the inverted index, allowing
     * memory to be released. A convenient alternative is {@link
     * MiniSearch#discard}, which needs only the document ID, and has the same
     * visible effect, but delays cleaning up the index until the next vacuuming.
     *
     * @param document  The document to be removed
     */
    remove(document2) {
      const { tokenize, processTerm: processTerm2, extractField, stringifyField, fields, idField } = this._options;
      const id = extractField(document2, idField);
      if (id == null) {
        throw new Error(`MiniSearch: document does not have ID field "${idField}"`);
      }
      const shortId = this._idToShortId.get(id);
      if (shortId == null) {
        throw new Error(`MiniSearch: cannot remove document with ID ${id}: it is not in the index`);
      }
      for (const field of fields) {
        const fieldValue = extractField(document2, field);
        if (fieldValue == null)
          continue;
        const tokens = tokenize(stringifyField(fieldValue, field), field);
        const fieldId = this._fieldIds[field];
        const uniqueTerms = new Set(tokens).size;
        this.removeFieldLength(shortId, fieldId, this._documentCount, uniqueTerms);
        for (const term of tokens) {
          const processedTerm = processTerm2(term, field);
          if (Array.isArray(processedTerm)) {
            for (const t of processedTerm) {
              this.removeTerm(fieldId, shortId, t);
            }
          } else if (processedTerm) {
            this.removeTerm(fieldId, shortId, processedTerm);
          }
        }
      }
      this._storedFields.delete(shortId);
      this._documentIds.delete(shortId);
      this._idToShortId.delete(id);
      this._fieldLength.delete(shortId);
      this._documentCount -= 1;
    }
    /**
     * Removes all the given documents from the index. If called with no arguments,
     * it removes _all_ documents from the index.
     *
     * @param documents  The documents to be removed. If this argument is omitted,
     * all documents are removed. Note that, for removing all documents, it is
     * more efficient to call this method with no arguments than to pass all
     * documents.
     */
    removeAll(documents) {
      if (documents) {
        for (const document2 of documents)
          this.remove(document2);
      } else if (arguments.length > 0) {
        throw new Error("Expected documents to be present. Omit the argument to remove all documents.");
      } else {
        this._index = new SearchableMap();
        this._documentCount = 0;
        this._documentIds = /* @__PURE__ */ new Map();
        this._idToShortId = /* @__PURE__ */ new Map();
        this._fieldLength = /* @__PURE__ */ new Map();
        this._avgFieldLength = [];
        this._storedFields = /* @__PURE__ */ new Map();
        this._nextId = 0;
      }
    }
    /**
     * Discards the document with the given ID, so it won't appear in search results
     *
     * It has the same visible effect of {@link MiniSearch.remove} (both cause the
     * document to stop appearing in searches), but a different effect on the
     * internal data structures:
     *
     *   - {@link MiniSearch#remove} requires passing the full document to be
     *   removed as argument, and removes it from the inverted index immediately.
     *
     *   - {@link MiniSearch#discard} instead only needs the document ID, and
     *   works by marking the current version of the document as discarded, so it
     *   is immediately ignored by searches. This is faster and more convenient
     *   than {@link MiniSearch#remove}, but the index is not immediately
     *   modified. To take care of that, vacuuming is performed after a certain
     *   number of documents are discarded, cleaning up the index and allowing
     *   memory to be released.
     *
     * After discarding a document, it is possible to re-add a new version, and
     * only the new version will appear in searches. In other words, discarding
     * and re-adding a document works exactly like removing and re-adding it. The
     * {@link MiniSearch.replace} method can also be used to replace a document
     * with a new version.
     *
     * #### Details about vacuuming
     *
     * Repetite calls to this method would leave obsolete document references in
     * the index, invisible to searches. Two mechanisms take care of cleaning up:
     * clean up during search, and vacuuming.
     *
     *   - Upon search, whenever a discarded ID is found (and ignored for the
     *   results), references to the discarded document are removed from the
     *   inverted index entries for the search terms. This ensures that subsequent
     *   searches for the same terms do not need to skip these obsolete references
     *   again.
     *
     *   - In addition, vacuuming is performed automatically by default (see the
     *   `autoVacuum` field in {@link Options}) after a certain number of
     *   documents are discarded. Vacuuming traverses all terms in the index,
     *   cleaning up all references to discarded documents. Vacuuming can also be
     *   triggered manually by calling {@link MiniSearch#vacuum}.
     *
     * @param id  The ID of the document to be discarded
     */
    discard(id) {
      const shortId = this._idToShortId.get(id);
      if (shortId == null) {
        throw new Error(`MiniSearch: cannot discard document with ID ${id}: it is not in the index`);
      }
      this._idToShortId.delete(id);
      this._documentIds.delete(shortId);
      this._storedFields.delete(shortId);
      (this._fieldLength.get(shortId) || []).forEach((fieldLength, fieldId) => {
        this.removeFieldLength(shortId, fieldId, this._documentCount, fieldLength);
      });
      this._fieldLength.delete(shortId);
      this._documentCount -= 1;
      this._dirtCount += 1;
      this.maybeAutoVacuum();
    }
    maybeAutoVacuum() {
      if (this._options.autoVacuum === false) {
        return;
      }
      const { minDirtFactor, minDirtCount, batchSize, batchWait } = this._options.autoVacuum;
      this.conditionalVacuum({ batchSize, batchWait }, { minDirtCount, minDirtFactor });
    }
    /**
     * Discards the documents with the given IDs, so they won't appear in search
     * results
     *
     * It is equivalent to calling {@link MiniSearch#discard} for all the given
     * IDs, but with the optimization of triggering at most one automatic
     * vacuuming at the end.
     *
     * Note: to remove all documents from the index, it is faster and more
     * convenient to call {@link MiniSearch.removeAll} with no argument, instead
     * of passing all IDs to this method.
     */
    discardAll(ids) {
      const autoVacuum = this._options.autoVacuum;
      try {
        this._options.autoVacuum = false;
        for (const id of ids) {
          this.discard(id);
        }
      } finally {
        this._options.autoVacuum = autoVacuum;
      }
      this.maybeAutoVacuum();
    }
    /**
     * It replaces an existing document with the given updated version
     *
     * It works by discarding the current version and adding the updated one, so
     * it is functionally equivalent to calling {@link MiniSearch#discard}
     * followed by {@link MiniSearch#add}. The ID of the updated document should
     * be the same as the original one.
     *
     * Since it uses {@link MiniSearch#discard} internally, this method relies on
     * vacuuming to clean up obsolete document references from the index, allowing
     * memory to be released (see {@link MiniSearch#discard}).
     *
     * @param updatedDocument  The updated document to replace the old version
     * with
     */
    replace(updatedDocument) {
      const { idField, extractField } = this._options;
      const id = extractField(updatedDocument, idField);
      this.discard(id);
      this.add(updatedDocument);
    }
    /**
     * Triggers a manual vacuuming, cleaning up references to discarded documents
     * from the inverted index
     *
     * Vacuuming is only useful for applications that use the {@link
     * MiniSearch#discard} or {@link MiniSearch#replace} methods.
     *
     * By default, vacuuming is performed automatically when needed (controlled by
     * the `autoVacuum` field in {@link Options}), so there is usually no need to
     * call this method, unless one wants to make sure to perform vacuuming at a
     * specific moment.
     *
     * Vacuuming traverses all terms in the inverted index in batches, and cleans
     * up references to discarded documents from the posting list, allowing memory
     * to be released.
     *
     * The method takes an optional object as argument with the following keys:
     *
     *   - `batchSize`: the size of each batch (1000 by default)
     *
     *   - `batchWait`: the number of milliseconds to wait between batches (10 by
     *   default)
     *
     * On large indexes, vacuuming could have a non-negligible cost: batching
     * avoids blocking the thread for long, diluting this cost so that it is not
     * negatively affecting the application. Nonetheless, this method should only
     * be called when necessary, and relying on automatic vacuuming is usually
     * better.
     *
     * It returns a promise that resolves (to undefined) when the clean up is
     * completed. If vacuuming is already ongoing at the time this method is
     * called, a new one is enqueued immediately after the ongoing one, and a
     * corresponding promise is returned. However, no more than one vacuuming is
     * enqueued on top of the ongoing one, even if this method is called more
     * times (enqueuing multiple ones would be useless).
     *
     * @param options  Configuration options for the batch size and delay. See
     * {@link VacuumOptions}.
     */
    vacuum(options = {}) {
      return this.conditionalVacuum(options);
    }
    conditionalVacuum(options, conditions) {
      if (this._currentVacuum) {
        this._enqueuedVacuumConditions = this._enqueuedVacuumConditions && conditions;
        if (this._enqueuedVacuum != null) {
          return this._enqueuedVacuum;
        }
        this._enqueuedVacuum = this._currentVacuum.then(() => {
          const conditions2 = this._enqueuedVacuumConditions;
          this._enqueuedVacuumConditions = defaultVacuumConditions;
          return this.performVacuuming(options, conditions2);
        });
        return this._enqueuedVacuum;
      }
      if (this.vacuumConditionsMet(conditions) === false) {
        return Promise.resolve();
      }
      this._currentVacuum = this.performVacuuming(options);
      return this._currentVacuum;
    }
    async performVacuuming(options, conditions) {
      const initialDirtCount = this._dirtCount;
      if (this.vacuumConditionsMet(conditions)) {
        const batchSize = options.batchSize || defaultVacuumOptions.batchSize;
        const batchWait = options.batchWait || defaultVacuumOptions.batchWait;
        let i = 1;
        for (const [term, fieldsData] of this._index) {
          for (const [fieldId, fieldIndex] of fieldsData) {
            for (const [shortId] of fieldIndex) {
              if (this._documentIds.has(shortId)) {
                continue;
              }
              if (fieldIndex.size <= 1) {
                fieldsData.delete(fieldId);
              } else {
                fieldIndex.delete(shortId);
              }
            }
          }
          if (this._index.get(term).size === 0) {
            this._index.delete(term);
          }
          if (i % batchSize === 0) {
            await new Promise((resolve) => setTimeout(resolve, batchWait));
          }
          i += 1;
        }
        this._dirtCount -= initialDirtCount;
      }
      await null;
      this._currentVacuum = this._enqueuedVacuum;
      this._enqueuedVacuum = null;
    }
    vacuumConditionsMet(conditions) {
      if (conditions == null) {
        return true;
      }
      let { minDirtCount, minDirtFactor } = conditions;
      minDirtCount = minDirtCount || defaultAutoVacuumOptions.minDirtCount;
      minDirtFactor = minDirtFactor || defaultAutoVacuumOptions.minDirtFactor;
      return this.dirtCount >= minDirtCount && this.dirtFactor >= minDirtFactor;
    }
    /**
     * Is `true` if a vacuuming operation is ongoing, `false` otherwise
     */
    get isVacuuming() {
      return this._currentVacuum != null;
    }
    /**
     * The number of documents discarded since the most recent vacuuming
     */
    get dirtCount() {
      return this._dirtCount;
    }
    /**
     * A number between 0 and 1 giving an indication about the proportion of
     * documents that are discarded, and can therefore be cleaned up by vacuuming.
     * A value close to 0 means that the index is relatively clean, while a higher
     * value means that the index is relatively dirty, and vacuuming could release
     * memory.
     */
    get dirtFactor() {
      return this._dirtCount / (1 + this._documentCount + this._dirtCount);
    }
    /**
     * Returns `true` if a document with the given ID is present in the index and
     * available for search, `false` otherwise
     *
     * @param id  The document ID
     */
    has(id) {
      return this._idToShortId.has(id);
    }
    /**
     * Returns the stored fields (as configured in the `storeFields` constructor
     * option) for the given document ID. Returns `undefined` if the document is
     * not present in the index.
     *
     * @param id  The document ID
     */
    getStoredFields(id) {
      const shortId = this._idToShortId.get(id);
      if (shortId == null) {
        return void 0;
      }
      return this._storedFields.get(shortId);
    }
    /**
     * Search for documents matching the given search query.
     *
     * The result is a list of scored document IDs matching the query, sorted by
     * descending score, and each including data about which terms were matched and
     * in which fields.
     *
     * ### Basic usage:
     *
     * ```javascript
     * // Search for "zen art motorcycle" with default options: terms have to match
     * // exactly, and individual terms are joined with OR
     * miniSearch.search('zen art motorcycle')
     * // => [ { id: 2, score: 2.77258, match: { ... } }, { id: 4, score: 1.38629, match: { ... } } ]
     * ```
     *
     * ### Restrict search to specific fields:
     *
     * ```javascript
     * // Search only in the 'title' field
     * miniSearch.search('zen', { fields: ['title'] })
     * ```
     *
     * ### Field boosting:
     *
     * ```javascript
     * // Boost a field
     * miniSearch.search('zen', { boost: { title: 2 } })
     * ```
     *
     * ### Prefix search:
     *
     * ```javascript
     * // Search for "moto" with prefix search (it will match documents
     * // containing terms that start with "moto" or "neuro")
     * miniSearch.search('moto neuro', { prefix: true })
     * ```
     *
     * ### Fuzzy search:
     *
     * ```javascript
     * // Search for "ismael" with fuzzy search (it will match documents containing
     * // terms similar to "ismael", with a maximum edit distance of 0.2 term.length
     * // (rounded to nearest integer)
     * miniSearch.search('ismael', { fuzzy: 0.2 })
     * ```
     *
     * ### Combining strategies:
     *
     * ```javascript
     * // Mix of exact match, prefix search, and fuzzy search
     * miniSearch.search('ismael mob', {
     *  prefix: true,
     *  fuzzy: 0.2
     * })
     * ```
     *
     * ### Advanced prefix and fuzzy search:
     *
     * ```javascript
     * // Perform fuzzy and prefix search depending on the search term. Here
     * // performing prefix and fuzzy search only on terms longer than 3 characters
     * miniSearch.search('ismael mob', {
     *  prefix: term => term.length > 3
     *  fuzzy: term => term.length > 3 ? 0.2 : null
     * })
     * ```
     *
     * ### Combine with AND:
     *
     * ```javascript
     * // Combine search terms with AND (to match only documents that contain both
     * // "motorcycle" and "art")
     * miniSearch.search('motorcycle art', { combineWith: 'AND' })
     * ```
     *
     * ### Combine with AND_NOT:
     *
     * There is also an AND_NOT combinator, that finds documents that match the
     * first term, but do not match any of the other terms. This combinator is
     * rarely useful with simple queries, and is meant to be used with advanced
     * query combinations (see later for more details).
     *
     * ### Filtering results:
     *
     * ```javascript
     * // Filter only results in the 'fiction' category (assuming that 'category'
     * // is a stored field)
     * miniSearch.search('motorcycle art', {
     *   filter: (result) => result.category === 'fiction'
     * })
     * ```
     *
     * ### Wildcard query
     *
     * Searching for an empty string (assuming the default tokenizer) returns no
     * results. Sometimes though, one needs to match all documents, like in a
     * "wildcard" search. This is possible by passing the special value
     * {@link MiniSearch.wildcard} as the query:
     *
     * ```javascript
     * // Return search results for all documents
     * miniSearch.search(MiniSearch.wildcard)
     * ```
     *
     * Note that search options such as `filter` and `boostDocument` are still
     * applied, influencing which results are returned, and their order:
     *
     * ```javascript
     * // Return search results for all documents in the 'fiction' category
     * miniSearch.search(MiniSearch.wildcard, {
     *   filter: (result) => result.category === 'fiction'
     * })
     * ```
     *
     * ### Advanced combination of queries:
     *
     * It is possible to combine different subqueries with OR, AND, and AND_NOT,
     * and even with different search options, by passing a query expression
     * tree object as the first argument, instead of a string.
     *
     * ```javascript
     * // Search for documents that contain "zen" and ("motorcycle" or "archery")
     * miniSearch.search({
     *   combineWith: 'AND',
     *   queries: [
     *     'zen',
     *     {
     *       combineWith: 'OR',
     *       queries: ['motorcycle', 'archery']
     *     }
     *   ]
     * })
     *
     * // Search for documents that contain ("apple" or "pear") but not "juice" and
     * // not "tree"
     * miniSearch.search({
     *   combineWith: 'AND_NOT',
     *   queries: [
     *     {
     *       combineWith: 'OR',
     *       queries: ['apple', 'pear']
     *     },
     *     'juice',
     *     'tree'
     *   ]
     * })
     * ```
     *
     * Each node in the expression tree can be either a string, or an object that
     * supports all {@link SearchOptions} fields, plus a `queries` array field for
     * subqueries.
     *
     * Note that, while this can become complicated to do by hand for complex or
     * deeply nested queries, it provides a formalized expression tree API for
     * external libraries that implement a parser for custom query languages.
     *
     * @param query  Search query
     * @param searchOptions  Search options. Each option, if not given, defaults to the corresponding value of `searchOptions` given to the constructor, or to the library default.
     */
    search(query, searchOptions = {}) {
      const { searchOptions: globalSearchOptions } = this._options;
      const searchOptionsWithDefaults = { ...globalSearchOptions, ...searchOptions };
      const rawResults = this.executeQuery(query, searchOptions);
      const results = [];
      for (const [docId, { score, terms, match }] of rawResults) {
        const quality = terms.length || 1;
        const result = {
          id: this._documentIds.get(docId),
          score: score * quality,
          terms: Object.keys(match),
          queryTerms: terms,
          match
        };
        Object.assign(result, this._storedFields.get(docId));
        if (searchOptionsWithDefaults.filter == null || searchOptionsWithDefaults.filter(result)) {
          results.push(result);
        }
      }
      if (query === _MiniSearch.wildcard && searchOptionsWithDefaults.boostDocument == null) {
        return results;
      }
      results.sort(byScore);
      return results;
    }
    /**
     * Provide suggestions for the given search query
     *
     * The result is a list of suggested modified search queries, derived from the
     * given search query, each with a relevance score, sorted by descending score.
     *
     * By default, it uses the same options used for search, except that by
     * default it performs prefix search on the last term of the query, and
     * combine terms with `'AND'` (requiring all query terms to match). Custom
     * options can be passed as a second argument. Defaults can be changed upon
     * calling the {@link MiniSearch} constructor, by passing a
     * `autoSuggestOptions` option.
     *
     * ### Basic usage:
     *
     * ```javascript
     * // Get suggestions for 'neuro':
     * miniSearch.autoSuggest('neuro')
     * // => [ { suggestion: 'neuromancer', terms: [ 'neuromancer' ], score: 0.46240 } ]
     * ```
     *
     * ### Multiple words:
     *
     * ```javascript
     * // Get suggestions for 'zen ar':
     * miniSearch.autoSuggest('zen ar')
     * // => [
     * //  { suggestion: 'zen archery art', terms: [ 'zen', 'archery', 'art' ], score: 1.73332 },
     * //  { suggestion: 'zen art', terms: [ 'zen', 'art' ], score: 1.21313 }
     * // ]
     * ```
     *
     * ### Fuzzy suggestions:
     *
     * ```javascript
     * // Correct spelling mistakes using fuzzy search:
     * miniSearch.autoSuggest('neromancer', { fuzzy: 0.2 })
     * // => [ { suggestion: 'neuromancer', terms: [ 'neuromancer' ], score: 1.03998 } ]
     * ```
     *
     * ### Filtering:
     *
     * ```javascript
     * // Get suggestions for 'zen ar', but only within the 'fiction' category
     * // (assuming that 'category' is a stored field):
     * miniSearch.autoSuggest('zen ar', {
     *   filter: (result) => result.category === 'fiction'
     * })
     * // => [
     * //  { suggestion: 'zen archery art', terms: [ 'zen', 'archery', 'art' ], score: 1.73332 },
     * //  { suggestion: 'zen art', terms: [ 'zen', 'art' ], score: 1.21313 }
     * // ]
     * ```
     *
     * @param queryString  Query string to be expanded into suggestions
     * @param options  Search options. The supported options and default values
     * are the same as for the {@link MiniSearch#search} method, except that by
     * default prefix search is performed on the last term in the query, and terms
     * are combined with `'AND'`.
     * @return  A sorted array of suggestions sorted by relevance score.
     */
    autoSuggest(queryString, options = {}) {
      options = { ...this._options.autoSuggestOptions, ...options };
      const suggestions = /* @__PURE__ */ new Map();
      for (const { score, terms } of this.search(queryString, options)) {
        const phrase = terms.join(" ");
        const suggestion = suggestions.get(phrase);
        if (suggestion != null) {
          suggestion.score += score;
          suggestion.count += 1;
        } else {
          suggestions.set(phrase, { score, terms, count: 1 });
        }
      }
      const results = [];
      for (const [suggestion, { score, terms, count }] of suggestions) {
        results.push({ suggestion, terms, score: score / count });
      }
      results.sort(byScore);
      return results;
    }
    /**
     * Total number of documents available to search
     */
    get documentCount() {
      return this._documentCount;
    }
    /**
     * Number of terms in the index
     */
    get termCount() {
      return this._index.size;
    }
    /**
     * Deserializes a JSON index (serialized with `JSON.stringify(miniSearch)`)
     * and instantiates a MiniSearch instance. It should be given the same options
     * originally used when serializing the index.
     *
     * ### Usage:
     *
     * ```javascript
     * // If the index was serialized with:
     * let miniSearch = new MiniSearch({ fields: ['title', 'text'] })
     * miniSearch.addAll(documents)
     *
     * const json = JSON.stringify(miniSearch)
     * // It can later be deserialized like this:
     * miniSearch = MiniSearch.loadJSON(json, { fields: ['title', 'text'] })
     * ```
     *
     * @param json  JSON-serialized index
     * @param options  configuration options, same as the constructor
     * @return An instance of MiniSearch deserialized from the given JSON.
     */
    static loadJSON(json, options) {
      if (options == null) {
        throw new Error("MiniSearch: loadJSON should be given the same options used when serializing the index");
      }
      return this.loadJS(JSON.parse(json), options);
    }
    /**
     * Async equivalent of {@link MiniSearch.loadJSON}
     *
     * This function is an alternative to {@link MiniSearch.loadJSON} that returns
     * a promise, and loads the index in batches, leaving pauses between them to avoid
     * blocking the main thread. It tends to be slower than the synchronous
     * version, but does not block the main thread, so it can be a better choice
     * when deserializing very large indexes.
     *
     * @param json  JSON-serialized index
     * @param options  configuration options, same as the constructor
     * @return A Promise that will resolve to an instance of MiniSearch deserialized from the given JSON.
     */
    static async loadJSONAsync(json, options) {
      if (options == null) {
        throw new Error("MiniSearch: loadJSON should be given the same options used when serializing the index");
      }
      return this.loadJSAsync(JSON.parse(json), options);
    }
    /**
     * Returns the default value of an option. It will throw an error if no option
     * with the given name exists.
     *
     * @param optionName  Name of the option
     * @return The default value of the given option
     *
     * ### Usage:
     *
     * ```javascript
     * // Get default tokenizer
     * MiniSearch.getDefault('tokenize')
     *
     * // Get default term processor
     * MiniSearch.getDefault('processTerm')
     *
     * // Unknown options will throw an error
     * MiniSearch.getDefault('notExisting')
     * // => throws 'MiniSearch: unknown option "notExisting"'
     * ```
     */
    static getDefault(optionName) {
      if (defaultOptions.hasOwnProperty(optionName)) {
        return getOwnProperty(defaultOptions, optionName);
      } else {
        throw new Error(`MiniSearch: unknown option "${optionName}"`);
      }
    }
    /**
     * @ignore
     */
    static loadJS(js, options) {
      const { index, documentIds, fieldLength, storedFields, serializationVersion } = js;
      const miniSearch = this.instantiateMiniSearch(js, options);
      miniSearch._documentIds = objectToNumericMap(documentIds);
      miniSearch._fieldLength = objectToNumericMap(fieldLength);
      miniSearch._storedFields = objectToNumericMap(storedFields);
      for (const [shortId, id] of miniSearch._documentIds) {
        miniSearch._idToShortId.set(id, shortId);
      }
      for (const [term, data] of index) {
        const dataMap = /* @__PURE__ */ new Map();
        for (const fieldId of Object.keys(data)) {
          let indexEntry = data[fieldId];
          if (serializationVersion === 1) {
            indexEntry = indexEntry.ds;
          }
          dataMap.set(parseInt(fieldId, 10), objectToNumericMap(indexEntry));
        }
        miniSearch._index.set(term, dataMap);
      }
      return miniSearch;
    }
    /**
     * @ignore
     */
    static async loadJSAsync(js, options) {
      const { index, documentIds, fieldLength, storedFields, serializationVersion } = js;
      const miniSearch = this.instantiateMiniSearch(js, options);
      miniSearch._documentIds = await objectToNumericMapAsync(documentIds);
      miniSearch._fieldLength = await objectToNumericMapAsync(fieldLength);
      miniSearch._storedFields = await objectToNumericMapAsync(storedFields);
      for (const [shortId, id] of miniSearch._documentIds) {
        miniSearch._idToShortId.set(id, shortId);
      }
      let count = 0;
      for (const [term, data] of index) {
        const dataMap = /* @__PURE__ */ new Map();
        for (const fieldId of Object.keys(data)) {
          let indexEntry = data[fieldId];
          if (serializationVersion === 1) {
            indexEntry = indexEntry.ds;
          }
          dataMap.set(parseInt(fieldId, 10), await objectToNumericMapAsync(indexEntry));
        }
        if (++count % 1e3 === 0)
          await wait(0);
        miniSearch._index.set(term, dataMap);
      }
      return miniSearch;
    }
    /**
     * @ignore
     */
    static instantiateMiniSearch(js, options) {
      const { documentCount, nextId: nextId2, fieldIds, averageFieldLength, dirtCount, serializationVersion } = js;
      if (serializationVersion !== 1 && serializationVersion !== 2) {
        throw new Error("MiniSearch: cannot deserialize an index created with an incompatible version");
      }
      const miniSearch = new _MiniSearch(options);
      miniSearch._documentCount = documentCount;
      miniSearch._nextId = nextId2;
      miniSearch._idToShortId = /* @__PURE__ */ new Map();
      miniSearch._fieldIds = fieldIds;
      miniSearch._avgFieldLength = averageFieldLength;
      miniSearch._dirtCount = dirtCount || 0;
      miniSearch._index = new SearchableMap();
      return miniSearch;
    }
    /**
     * @ignore
     */
    executeQuery(query, searchOptions = {}) {
      if (query === _MiniSearch.wildcard) {
        return this.executeWildcardQuery(searchOptions);
      }
      if (typeof query !== "string") {
        const options2 = { ...searchOptions, ...query, queries: void 0 };
        const results2 = query.queries.map((subquery) => this.executeQuery(subquery, options2));
        return this.combineResults(results2, options2.combineWith);
      }
      const { tokenize, processTerm: processTerm2, searchOptions: globalSearchOptions } = this._options;
      const options = { tokenize, processTerm: processTerm2, ...globalSearchOptions, ...searchOptions };
      const { tokenize: searchTokenize, processTerm: searchProcessTerm } = options;
      const terms = searchTokenize(query).flatMap((term) => searchProcessTerm(term)).filter((term) => !!term);
      const queries = terms.map(termToQuerySpec(options));
      const results = queries.map((query2) => this.executeQuerySpec(query2, options));
      return this.combineResults(results, options.combineWith);
    }
    /**
     * @ignore
     */
    executeQuerySpec(query, searchOptions) {
      const options = { ...this._options.searchOptions, ...searchOptions };
      const boosts = (options.fields || this._options.fields).reduce((boosts2, field) => ({ ...boosts2, [field]: getOwnProperty(options.boost, field) || 1 }), {});
      const { boostDocument, weights, maxFuzzy, bm25: bm25params } = options;
      const { fuzzy: fuzzyWeight, prefix: prefixWeight } = { ...defaultSearchOptions.weights, ...weights };
      const data = this._index.get(query.term);
      const results = this.termResults(query.term, query.term, 1, query.termBoost, data, boosts, boostDocument, bm25params);
      let prefixMatches;
      let fuzzyMatches;
      if (query.prefix) {
        prefixMatches = this._index.atPrefix(query.term);
      }
      if (query.fuzzy) {
        const fuzzy = query.fuzzy === true ? 0.2 : query.fuzzy;
        const maxDistance = fuzzy < 1 ? Math.min(maxFuzzy, Math.round(query.term.length * fuzzy)) : fuzzy;
        if (maxDistance)
          fuzzyMatches = this._index.fuzzyGet(query.term, maxDistance);
      }
      if (prefixMatches) {
        for (const [term, data2] of prefixMatches) {
          const distance = term.length - query.term.length;
          if (!distance) {
            continue;
          }
          fuzzyMatches === null || fuzzyMatches === void 0 ? void 0 : fuzzyMatches.delete(term);
          const weight = prefixWeight * term.length / (term.length + 0.3 * distance);
          this.termResults(query.term, term, weight, query.termBoost, data2, boosts, boostDocument, bm25params, results);
        }
      }
      if (fuzzyMatches) {
        for (const term of fuzzyMatches.keys()) {
          const [data2, distance] = fuzzyMatches.get(term);
          if (!distance) {
            continue;
          }
          const weight = fuzzyWeight * term.length / (term.length + distance);
          this.termResults(query.term, term, weight, query.termBoost, data2, boosts, boostDocument, bm25params, results);
        }
      }
      return results;
    }
    /**
     * @ignore
     */
    executeWildcardQuery(searchOptions) {
      const results = /* @__PURE__ */ new Map();
      const options = { ...this._options.searchOptions, ...searchOptions };
      for (const [shortId, id] of this._documentIds) {
        const score = options.boostDocument ? options.boostDocument(id, "", this._storedFields.get(shortId)) : 1;
        results.set(shortId, {
          score,
          terms: [],
          match: {}
        });
      }
      return results;
    }
    /**
     * @ignore
     */
    combineResults(results, combineWith = OR) {
      if (results.length === 0) {
        return /* @__PURE__ */ new Map();
      }
      const operator = combineWith.toLowerCase();
      const combinator = combinators[operator];
      if (!combinator) {
        throw new Error(`Invalid combination operator: ${combineWith}`);
      }
      return results.reduce(combinator) || /* @__PURE__ */ new Map();
    }
    /**
     * Allows serialization of the index to JSON, to possibly store it and later
     * deserialize it with {@link MiniSearch.loadJSON}.
     *
     * Normally one does not directly call this method, but rather call the
     * standard JavaScript `JSON.stringify()` passing the {@link MiniSearch}
     * instance, and JavaScript will internally call this method. Upon
     * deserialization, one must pass to {@link MiniSearch.loadJSON} the same
     * options used to create the original instance that was serialized.
     *
     * ### Usage:
     *
     * ```javascript
     * // Serialize the index:
     * let miniSearch = new MiniSearch({ fields: ['title', 'text'] })
     * miniSearch.addAll(documents)
     * const json = JSON.stringify(miniSearch)
     *
     * // Later, to deserialize it:
     * miniSearch = MiniSearch.loadJSON(json, { fields: ['title', 'text'] })
     * ```
     *
     * @return A plain-object serializable representation of the search index.
     */
    toJSON() {
      const index = [];
      for (const [term, fieldIndex] of this._index) {
        const data = {};
        for (const [fieldId, freqs] of fieldIndex) {
          data[fieldId] = Object.fromEntries(freqs);
        }
        index.push([term, data]);
      }
      return {
        documentCount: this._documentCount,
        nextId: this._nextId,
        documentIds: Object.fromEntries(this._documentIds),
        fieldIds: this._fieldIds,
        fieldLength: Object.fromEntries(this._fieldLength),
        averageFieldLength: this._avgFieldLength,
        storedFields: Object.fromEntries(this._storedFields),
        dirtCount: this._dirtCount,
        index,
        serializationVersion: 2
      };
    }
    /**
     * @ignore
     */
    termResults(sourceTerm, derivedTerm, termWeight, termBoost, fieldTermData, fieldBoosts, boostDocumentFn, bm25params, results = /* @__PURE__ */ new Map()) {
      if (fieldTermData == null)
        return results;
      for (const field of Object.keys(fieldBoosts)) {
        const fieldBoost = fieldBoosts[field];
        const fieldId = this._fieldIds[field];
        const fieldTermFreqs = fieldTermData.get(fieldId);
        if (fieldTermFreqs == null)
          continue;
        let matchingFields = fieldTermFreqs.size;
        const avgFieldLength = this._avgFieldLength[fieldId];
        for (const docId of fieldTermFreqs.keys()) {
          if (!this._documentIds.has(docId)) {
            this.removeTerm(fieldId, docId, derivedTerm);
            matchingFields -= 1;
            continue;
          }
          const docBoost = boostDocumentFn ? boostDocumentFn(this._documentIds.get(docId), derivedTerm, this._storedFields.get(docId)) : 1;
          if (!docBoost)
            continue;
          const termFreq = fieldTermFreqs.get(docId);
          const fieldLength = this._fieldLength.get(docId)[fieldId];
          const rawScore = calcBM25Score(termFreq, matchingFields, this._documentCount, fieldLength, avgFieldLength, bm25params);
          const weightedScore = termWeight * termBoost * fieldBoost * docBoost * rawScore;
          const result = results.get(docId);
          if (result) {
            result.score += weightedScore;
            assignUniqueTerm(result.terms, sourceTerm);
            const match = getOwnProperty(result.match, derivedTerm);
            if (match) {
              match.push(field);
            } else {
              result.match[derivedTerm] = [field];
            }
          } else {
            results.set(docId, {
              score: weightedScore,
              terms: [sourceTerm],
              match: { [derivedTerm]: [field] }
            });
          }
        }
      }
      return results;
    }
    /**
     * @ignore
     */
    addTerm(fieldId, documentId, term) {
      const indexData = this._index.fetch(term, createMap);
      let fieldIndex = indexData.get(fieldId);
      if (fieldIndex == null) {
        fieldIndex = /* @__PURE__ */ new Map();
        fieldIndex.set(documentId, 1);
        indexData.set(fieldId, fieldIndex);
      } else {
        const docs = fieldIndex.get(documentId);
        fieldIndex.set(documentId, (docs || 0) + 1);
      }
    }
    /**
     * @ignore
     */
    removeTerm(fieldId, documentId, term) {
      if (!this._index.has(term)) {
        this.warnDocumentChanged(documentId, fieldId, term);
        return;
      }
      const indexData = this._index.fetch(term, createMap);
      const fieldIndex = indexData.get(fieldId);
      if (fieldIndex == null || fieldIndex.get(documentId) == null) {
        this.warnDocumentChanged(documentId, fieldId, term);
      } else if (fieldIndex.get(documentId) <= 1) {
        if (fieldIndex.size <= 1) {
          indexData.delete(fieldId);
        } else {
          fieldIndex.delete(documentId);
        }
      } else {
        fieldIndex.set(documentId, fieldIndex.get(documentId) - 1);
      }
      if (this._index.get(term).size === 0) {
        this._index.delete(term);
      }
    }
    /**
     * @ignore
     */
    warnDocumentChanged(shortDocumentId, fieldId, term) {
      for (const fieldName of Object.keys(this._fieldIds)) {
        if (this._fieldIds[fieldName] === fieldId) {
          this._options.logger("warn", `MiniSearch: document with ID ${this._documentIds.get(shortDocumentId)} has changed before removal: term "${term}" was not present in field "${fieldName}". Removing a document after it has changed can corrupt the index!`, "version_conflict");
          return;
        }
      }
    }
    /**
     * @ignore
     */
    addDocumentId(documentId) {
      const shortDocumentId = this._nextId;
      this._idToShortId.set(documentId, shortDocumentId);
      this._documentIds.set(shortDocumentId, documentId);
      this._documentCount += 1;
      this._nextId += 1;
      return shortDocumentId;
    }
    /**
     * @ignore
     */
    addFields(fields) {
      for (let i = 0; i < fields.length; i++) {
        this._fieldIds[fields[i]] = i;
      }
    }
    /**
     * @ignore
     */
    addFieldLength(documentId, fieldId, count, length) {
      let fieldLengths = this._fieldLength.get(documentId);
      if (fieldLengths == null)
        this._fieldLength.set(documentId, fieldLengths = []);
      fieldLengths[fieldId] = length;
      const averageFieldLength = this._avgFieldLength[fieldId] || 0;
      const totalFieldLength = averageFieldLength * count + length;
      this._avgFieldLength[fieldId] = totalFieldLength / (count + 1);
    }
    /**
     * @ignore
     */
    removeFieldLength(documentId, fieldId, count, length) {
      if (count === 1) {
        this._avgFieldLength[fieldId] = 0;
        return;
      }
      const totalFieldLength = this._avgFieldLength[fieldId] * count - length;
      this._avgFieldLength[fieldId] = totalFieldLength / (count - 1);
    }
    /**
     * @ignore
     */
    saveStoredFields(documentId, doc) {
      const { storeFields, extractField } = this._options;
      if (storeFields == null || storeFields.length === 0) {
        return;
      }
      let documentFields = this._storedFields.get(documentId);
      if (documentFields == null)
        this._storedFields.set(documentId, documentFields = {});
      for (const fieldName of storeFields) {
        const fieldValue = extractField(doc, fieldName);
        if (fieldValue !== void 0)
          documentFields[fieldName] = fieldValue;
      }
    }
  };
  MiniSearch.wildcard = /* @__PURE__ */ Symbol("*");
  var getOwnProperty = (object, property) => Object.prototype.hasOwnProperty.call(object, property) ? object[property] : void 0;
  var combinators = {
    [OR]: (a, b) => {
      for (const docId of b.keys()) {
        const existing = a.get(docId);
        if (existing == null) {
          a.set(docId, b.get(docId));
        } else {
          const { score, terms, match } = b.get(docId);
          existing.score = existing.score + score;
          existing.match = Object.assign(existing.match, match);
          assignUniqueTerms(existing.terms, terms);
        }
      }
      return a;
    },
    [AND]: (a, b) => {
      const combined = /* @__PURE__ */ new Map();
      for (const docId of b.keys()) {
        const existing = a.get(docId);
        if (existing == null)
          continue;
        const { score, terms, match } = b.get(docId);
        assignUniqueTerms(existing.terms, terms);
        combined.set(docId, {
          score: existing.score + score,
          terms: existing.terms,
          match: Object.assign(existing.match, match)
        });
      }
      return combined;
    },
    [AND_NOT]: (a, b) => {
      for (const docId of b.keys())
        a.delete(docId);
      return a;
    }
  };
  var defaultBM25params = { k: 1.2, b: 0.7, d: 0.5 };
  var calcBM25Score = (termFreq, matchingCount, totalCount, fieldLength, avgFieldLength, bm25params) => {
    const { k, b, d } = bm25params;
    const invDocFreq = Math.log(1 + (totalCount - matchingCount + 0.5) / (matchingCount + 0.5));
    return invDocFreq * (d + termFreq * (k + 1) / (termFreq + k * (1 - b + b * fieldLength / avgFieldLength)));
  };
  var termToQuerySpec = (options) => (term, i, terms) => {
    const fuzzy = typeof options.fuzzy === "function" ? options.fuzzy(term, i, terms) : options.fuzzy || false;
    const prefix = typeof options.prefix === "function" ? options.prefix(term, i, terms) : options.prefix === true;
    const termBoost = typeof options.boostTerm === "function" ? options.boostTerm(term, i, terms) : 1;
    return { term, fuzzy, prefix, termBoost };
  };
  var defaultOptions = {
    idField: "id",
    extractField: (document2, fieldName) => document2[fieldName],
    stringifyField: (fieldValue, fieldName) => fieldValue.toString(),
    tokenize: (text) => text.split(SPACE_OR_PUNCTUATION),
    processTerm: (term) => term.toLowerCase(),
    fields: void 0,
    searchOptions: void 0,
    storeFields: [],
    logger: (level, message) => {
      if (typeof (console === null || console === void 0 ? void 0 : console[level]) === "function")
        console[level](message);
    },
    autoVacuum: true
  };
  var defaultSearchOptions = {
    combineWith: OR,
    prefix: false,
    fuzzy: false,
    maxFuzzy: 6,
    boost: {},
    weights: { fuzzy: 0.45, prefix: 0.375 },
    bm25: defaultBM25params
  };
  var defaultAutoSuggestOptions = {
    combineWith: AND,
    prefix: (term, i, terms) => i === terms.length - 1
  };
  var defaultVacuumOptions = { batchSize: 1e3, batchWait: 10 };
  var defaultVacuumConditions = { minDirtFactor: 0.1, minDirtCount: 20 };
  var defaultAutoVacuumOptions = { ...defaultVacuumOptions, ...defaultVacuumConditions };
  var assignUniqueTerm = (target, term) => {
    if (!target.includes(term))
      target.push(term);
  };
  var assignUniqueTerms = (target, source) => {
    for (const term of source) {
      if (!target.includes(term))
        target.push(term);
    }
  };
  var byScore = ({ score: a }, { score: b }) => b - a;
  var createMap = () => /* @__PURE__ */ new Map();
  var objectToNumericMap = (object) => {
    const map = /* @__PURE__ */ new Map();
    for (const key of Object.keys(object)) {
      map.set(parseInt(key, 10), object[key]);
    }
    return map;
  };
  var objectToNumericMapAsync = async (object) => {
    const map = /* @__PURE__ */ new Map();
    let count = 0;
    for (const key of Object.keys(object)) {
      map.set(parseInt(key, 10), object[key]);
      if (++count % 1e3 === 0) {
        await wait(0);
      }
    }
    return map;
  };
  var wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
  var SPACE_OR_PUNCTUATION = /[\n\r\p{Z}\p{P}]+/u;

  // lib/minisearch-lexical.ts
  var STOPWORDS = /* @__PURE__ */ new Set([
    "a",
    "an",
    "about",
    "where",
    "is",
    "of",
    "the",
    "and",
    "are",
    "as",
    "at",
    "be",
    "but",
    "by",
    "can",
    "could",
    "did",
    "do",
    "does",
    "for",
    "from",
    "had",
    "has",
    "have",
    "how",
    "i",
    "if",
    "in",
    "into",
    "it",
    "its",
    "me",
    "my",
    "on",
    "or",
    "part",
    "say",
    "talk",
    "talks",
    "tell",
    "than",
    "that",
    "their",
    "them",
    "then",
    "there",
    "these",
    "this",
    "to",
    "us",
    "was",
    "we",
    "what",
    "when",
    "which",
    "who",
    "why",
    "will",
    "with",
    "would",
    "you",
    "your",
    "want",
    "find",
    "show",
    "happen",
    "happens",
    "section",
    "thing"
  ]);
  function stem(word) {
    return word.replace(/(ization|isation)$/, "ize").replace(/(ing|edly|ed|ly|ies|ied|es|s)$/, "").replace(/(.)\1$/, "$1");
  }
  function processTerm(term) {
    const lower = term.toLowerCase();
    if (lower.length <= 1 || STOPWORDS.has(lower)) return false;
    return stem(lower);
  }
  function buildLexicalIndex(chunks) {
    const ms = new MiniSearch({
      fields: ["text", "heading"],
      storeFields: [],
      processTerm
    });
    ms.addAll(chunks.map((c, id) => ({ id, text: c.text, heading: c.heading })));
    return ms;
  }
  function lexicalSearch(index, query) {
    const results = index.search(query, {
      prefix: true,
      // No fuzzy for terms < 4 chars; fractional 0.2 scales to length above that.
      fuzzy: (term) => term.length >= 4 ? 0.2 : false,
      combineWith: "OR"
    });
    return results.map((r) => {
      const queryTerms = r.queryTerms ?? [];
      const docTerms = r.terms ?? [];
      const hasExact = queryTerms.some(
        (qt) => docTerms.some((dt) => dt.startsWith(qt))
      );
      return {
        index: r.id,
        score: r.score,
        terms: docTerms,
        hasExact,
        fuzzyOnly: !hasExact && docTerms.length > 0
      };
    });
  }

  // lib/substring.ts
  function countOccurrences(haystack, needle) {
    if (!needle) return 0;
    const h2 = haystack.toLowerCase();
    const n = needle.toLowerCase();
    let count = 0;
    let from = 0;
    for (; ; ) {
      const at = h2.indexOf(n, from);
      if (at === -1) break;
      count++;
      from = at + n.length;
    }
    return count;
  }
  function substringHits(chunkTexts, query) {
    const needle = query.trim();
    if (!needle) return [];
    const hits = [];
    for (let i = 0; i < chunkTexts.length; i++) {
      const count = countOccurrences(chunkTexts[i], needle);
      if (count > 0) hits.push({ index: i, count });
    }
    return hits;
  }
  function totalOccurrences(hits) {
    return hits.reduce((sum, h2) => sum + h2.count, 0);
  }

  // lib/provenance.ts
  function classify(inp, thresholds) {
    if (inp.hasSubstring || inp.hasExactKeyword) return "exact";
    if (inp.hasFuzzyKeyword) return "close";
    if (inp.cosine >= thresholds.relatedFloor) return "related";
    return "loose";
  }
  var PROVENANCE_META = {
    exact: { label: "Exact match", className: "sf-tag-exact" },
    close: { label: "Close match", className: "sf-tag-close" },
    related: { label: "Related", className: "sf-tag-related" },
    loose: { label: "Loosely related", className: "sf-tag-loose" }
  };
  var PROVENANCE_ORDER = [
    "exact",
    "close",
    "related",
    "loose"
  ];

  // lib/vector.ts
  function cosineSimilarity(a, b) {
    let dot = 0;
    let na = 0;
    let nb = 0;
    for (let i = 0; i < a.length; i++) {
      dot += a[i] * b[i];
      na += a[i] * a[i];
      nb += b[i] * b[i];
    }
    const denom = Math.sqrt(na) * Math.sqrt(nb);
    return denom === 0 ? 0 : dot / denom;
  }
  function topK(query, vectors, k = 5) {
    const scored = vectors.map((v, index) => ({
      index,
      score: cosineSimilarity(query, v)
    }));
    scored.sort((a, b) => b.score - a.score);
    return scored.slice(0, k);
  }
  var RRF_K = 60;
  function reciprocalRankFusion(lists, k = 5, rrfK = RRF_K) {
    const acc = /* @__PURE__ */ new Map();
    for (const { name, list } of lists) {
      list.order.forEach((chunkIndex, rank) => {
        const contribution = list.weight / (rrfK + rank);
        const existing = acc.get(chunkIndex) ?? { index: chunkIndex, score: 0, ranks: {} };
        existing.score += contribution;
        existing.ranks[name] = rank;
        acc.set(chunkIndex, existing);
      });
    }
    return [...acc.values()].sort((a, b) => b.score - a.score).slice(0, k);
  }

  // extension/extension-search.ts
  var RRF_K2 = 60;
  var SEMANTIC_WEIGHT = 1;
  var LEXICAL_WEIGHT = 0.9;
  var SUBSTRING_WEIGHT = 0.3;
  var LOOSE_FLOOR = 0.15;
  var RELATED_FLOOR = 0.4;
  var MAX_RESULTS = 50;
  var PageIndex = class {
    constructor(blocks) {
      this.vectors = null;
      this.chunks = chunkBlocks(blocks);
      this.chunkTexts = this.chunks.map((c) => c.text);
      this.textHash = hashText(this.chunkTexts.join("\0"));
      this.lexical = buildLexicalIndex(
        this.chunks.map((c) => ({ text: c.text, heading: c.heading }))
      );
    }
    get hasVectors() {
      return this.vectors !== null && this.vectors.length === this.chunks.length;
    }
    get chunkCount() {
      return this.chunks.length;
    }
    setVectors(vectors) {
      if (vectors.length === this.chunks.length) this.vectors = vectors;
    }
    /** Run the full hybrid search for one query. Pure & synchronous —
     *  the query vector (if any) is computed by the caller and passed
     *  in, so this module never imports the model runtime. */
    search(query, queryVector) {
      const q = query.trim();
      if (!q) {
        return {
          results: [],
          totalOccurrences: 0,
          literalChunkCount: 0,
          semanticUsed: false
        };
      }
      const subHits = substringHits(this.chunkTexts, q);
      const subCountMap = new Map(subHits.map((h2) => [h2.index, h2.count]));
      const subHitSet = new Set(subHits.map((h2) => h2.index));
      const substringOrder = [...subHits].sort((a, b) => b.count - a.count).map((h2) => h2.index);
      const lexHits = lexicalSearch(this.lexical, q);
      const lexHitSet = new Set(lexHits.map((h2) => h2.index));
      const lexTermsMap = new Map(lexHits.map((h2) => [h2.index, h2.terms]));
      const lexExactSet = new Set(lexHits.filter((h2) => h2.hasExact).map((h2) => h2.index));
      const lexFuzzySet = new Set(lexHits.filter((h2) => h2.fuzzyOnly).map((h2) => h2.index));
      const keywordOrder = lexHits.map((h2) => h2.index);
      const semanticUsed = this.hasVectors && queryVector !== null;
      const cosineMap = /* @__PURE__ */ new Map();
      let semanticOrder = [];
      if (semanticUsed) {
        const sem = topK(queryVector, this.vectors, this.vectors.length);
        for (const s of sem) cosineMap.set(s.index, s.score);
        semanticOrder = sem.map((s) => s.index);
      }
      const lists = [
        { name: "keyword", list: { order: keywordOrder, weight: LEXICAL_WEIGHT } },
        { name: "substring", list: { order: substringOrder, weight: SUBSTRING_WEIGHT } }
      ];
      if (semanticUsed) {
        lists.unshift({
          name: "semantic",
          list: { order: semanticOrder, weight: SEMANTIC_WEIGHT }
        });
      }
      const fused = reciprocalRankFusion(lists, this.chunks.length, RRF_K2);
      const results = fused.filter((r) => {
        const cosine = cosineMap.get(r.index) ?? 0;
        return subHitSet.has(r.index) || lexHitSet.has(r.index) || semanticUsed && cosine >= LOOSE_FLOOR;
      }).slice(0, MAX_RESULTS).map((r) => {
        const cosine = cosineMap.get(r.index) ?? 0;
        return {
          index: r.index,
          score: r.score,
          cosine,
          matchedTerms: lexTermsMap.get(r.index) ?? [],
          substringCount: subCountMap.get(r.index) ?? 0,
          provenance: classify(
            {
              hasSubstring: subHitSet.has(r.index),
              hasExactKeyword: lexExactSet.has(r.index),
              hasFuzzyKeyword: lexFuzzySet.has(r.index),
              cosine
            },
            { relatedFloor: RELATED_FLOOR, looseFloor: LOOSE_FLOOR }
          )
        };
      });
      return {
        results,
        totalOccurrences: totalOccurrences(subHits),
        literalChunkCount: subHits.length,
        semanticUsed
      };
    }
  };

  // extension/highlighter.ts
  var HALO_CLASS = "semantic-find-active-result";
  var MARK_ATTR = "data-sf-mark";
  var haloEl = null;
  var markedRoots = /* @__PURE__ */ new Set();
  function clearHighlights() {
    if (haloEl) {
      haloEl.classList.remove(HALO_CLASS);
      haloEl = null;
    }
    for (const root of markedRoots) unwrapMarks(root);
    markedRoots.clear();
  }
  function highlightElement(el, needle) {
    clearHighlights();
    haloEl = el;
    el.classList.add(HALO_CLASS);
    el.scrollIntoView({ behavior: "smooth", block: "center" });
    const n = needle?.trim();
    if (n) markLiteral(el, n);
  }
  function markLiteral(root, needle) {
    const lowerNeedle = needle.toLowerCase();
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
      acceptNode(node) {
        const parent = node.parentElement;
        if (!parent) return NodeFilter.FILTER_REJECT;
        if (parent.closest(`[${MARK_ATTR}]`)) return NodeFilter.FILTER_REJECT;
        const text = node.nodeValue ?? "";
        return text.toLowerCase().includes(lowerNeedle) ? NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_REJECT;
      }
    });
    const targets = [];
    for (let n = walker.nextNode(); n; n = walker.nextNode()) {
      targets.push(n);
    }
    let wrappedAny = false;
    for (const textNode of targets) {
      if (wrapOccurrences(textNode, lowerNeedle, needle.length)) wrappedAny = true;
    }
    if (wrappedAny) markedRoots.add(root);
  }
  function wrapOccurrences(textNode, lowerNeedle, needleLen) {
    const value = textNode.nodeValue ?? "";
    const lower = value.toLowerCase();
    const frag = document.createDocumentFragment();
    let last2 = 0;
    let at = lower.indexOf(lowerNeedle);
    if (at === -1) return false;
    while (at !== -1) {
      if (at > last2) frag.appendChild(document.createTextNode(value.slice(last2, at)));
      const mark = document.createElement("mark");
      mark.setAttribute(MARK_ATTR, "");
      mark.textContent = value.slice(at, at + needleLen);
      frag.appendChild(mark);
      last2 = at + needleLen;
      at = lower.indexOf(lowerNeedle, last2);
    }
    if (last2 < value.length) frag.appendChild(document.createTextNode(value.slice(last2)));
    textNode.parentNode?.replaceChild(frag, textNode);
    return true;
  }
  function unwrapMarks(root) {
    const marks = root.querySelectorAll(`mark[${MARK_ATTR}]`);
    for (const mark of marks) {
      const text = document.createTextNode(mark.textContent ?? "");
      mark.parentNode?.replaceChild(text, mark);
    }
    root.normalize();
  }

  // extension/live-find.ts
  var HL_ALL = "sf-find";
  var HL_CURRENT = "sf-find-current";
  var OVERLAY_ID = "semantic-find-extension-root";
  var SKIP_TAGS2 = /* @__PURE__ */ new Set([
    "SCRIPT",
    "STYLE",
    "NOSCRIPT",
    "TEMPLATE",
    "TEXTAREA",
    "SELECT",
    "OPTION"
  ]);
  var ranges = [];
  var current = -1;
  function registry() {
    const css = CSS;
    return css.highlights ?? null;
  }
  function isVisible(el) {
    const style = window.getComputedStyle(el);
    if (style.display === "none" || style.visibility === "hidden" || style.visibility === "collapse") {
      return false;
    }
    return el.getClientRects().length > 0;
  }
  function clearLiveFind() {
    const reg = registry();
    if (reg) {
      reg.delete(HL_ALL);
      reg.delete(HL_CURRENT);
    }
    ranges = [];
    current = -1;
  }
  function runLiveFind(query) {
    clearLiveFind();
    const reg = registry();
    const needle = query.trim();
    if (!reg || !needle || !document.body) return 0;
    const lower = needle.toLowerCase();
    const len = needle.length;
    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT, {
      acceptNode(node) {
        const value = node.nodeValue;
        const parent = node.parentElement;
        if (!value || !parent) return NodeFilter.FILTER_REJECT;
        if (SKIP_TAGS2.has(parent.tagName)) return NodeFilter.FILTER_REJECT;
        if (parent.closest(`#${OVERLAY_ID}`)) return NodeFilter.FILTER_REJECT;
        if (!value.toLowerCase().includes(lower)) return NodeFilter.FILTER_REJECT;
        if (!isVisible(parent)) return NodeFilter.FILTER_REJECT;
        return NodeFilter.FILTER_ACCEPT;
      }
    });
    const found = [];
    for (let node = walker.nextNode(); node; node = walker.nextNode()) {
      const text = node.nodeValue ?? "";
      const lowerText = text.toLowerCase();
      let from = 0;
      for (; ; ) {
        const at = lowerText.indexOf(lower, from);
        if (at === -1) break;
        const range = document.createRange();
        range.setStart(node, at);
        range.setEnd(node, at + len);
        found.push(range);
        from = at + len;
      }
    }
    ranges = found;
    if (ranges.length) reg.set(HL_ALL, new Highlight(...ranges));
    return ranges.length;
  }
  function setCurrentMatch(index) {
    const reg = registry();
    const n = ranges.length;
    if (!reg || n === 0) return;
    current = (index % n + n) % n;
    reg.set(HL_CURRENT, new Highlight(ranges[current]));
    const range = ranges[current];
    const rect = range.getBoundingClientRect();
    const vh = window.innerHeight || document.documentElement.clientHeight;
    const onScreen = rect.top >= 0 && rect.bottom <= vh;
    if (!onScreen) {
      range.startContainer.parentElement?.scrollIntoView({
        behavior: "smooth",
        block: "center"
      });
    }
  }
  function nextMatch() {
    setCurrentMatch(current + 1);
  }
  function prevMatch() {
    setCurrentMatch(current - 1);
  }
  function currentMatchIndex() {
    return current;
  }

  // extension/embedding-client.ts
  var MODEL_ID = "Xenova/all-MiniLM-L6-v2";
  var port = null;
  var portPromise = null;
  var modelReady = null;
  var nextId = 1;
  var pending = /* @__PURE__ */ new Map();
  function rejectAll(err) {
    for (const [, p] of pending) p.reject(err);
    pending.clear();
  }
  async function getPort() {
    if (port) return port;
    if (portPromise) return portPromise;
    portPromise = (async () => {
      await chrome.runtime.sendMessage({ type: "SF_ENSURE_OFFSCREEN" });
      const p = chrome.runtime.connect({ name: "sf-embed" });
      p.onMessage.addListener((m) => {
        if (m.type === "fatal") {
          rejectAll(new Error(m.message ?? "embedding worker crashed"));
          return;
        }
        const entry = pending.get(m.id);
        if (!entry) return;
        switch (m.type) {
          case "progress":
            entry.onProgress?.({
              status: m.status ?? "downloading",
              file: m.file,
              progress: m.progress
            });
            break;
          case "embedProgress":
            entry.onEmbedProgress?.(m.done ?? 0, m.total ?? 0);
            break;
          case "ready":
            pending.delete(m.id);
            entry.resolve({ device: m.device });
            break;
          case "vector":
            pending.delete(m.id);
            entry.resolve(Float32Array.from(m.vector ?? []));
            break;
          case "vectors":
            pending.delete(m.id);
            entry.resolve((m.vectors ?? []).map((v) => Float32Array.from(v)));
            break;
          case "error":
            pending.delete(m.id);
            entry.reject(new Error(m.message ?? "model error"));
            break;
        }
      });
      p.onDisconnect.addListener(() => {
        const reason = chrome.runtime.lastError?.message ?? "offscreen model port disconnected";
        rejectAll(new Error(reason));
        port = null;
        portPromise = null;
        modelReady = null;
      });
      port = p;
      return p;
    })();
    portPromise.catch(() => {
      portPromise = null;
    });
    return portPromise;
  }
  function call(message, opts) {
    const id = nextId++;
    return new Promise((resolve, reject) => {
      pending.set(id, {
        resolve,
        reject,
        onProgress: opts?.onProgress,
        onEmbedProgress: opts?.onEmbedProgress
      });
      getPort().then(
        (p) => p.postMessage({ id, ...message }),
        (err) => {
          pending.delete(id);
          reject(err instanceof Error ? err : new Error(String(err)));
        }
      );
    });
  }
  function ensureModel(onProgress) {
    if (modelReady) return modelReady;
    const wasmBase = chrome.runtime.getURL("assets/wasm/");
    modelReady = call({ type: "load", wasmBase }, { onProgress });
    modelReady.catch(() => {
      modelReady = null;
    });
    return modelReady;
  }
  async function loadModel(onProgress) {
    return ensureModel(onProgress);
  }
  async function embedText(text) {
    await ensureModel();
    return call({ type: "embedOne", text });
  }
  async function embedChunks(texts, onProgress) {
    await ensureModel();
    return call(
      { type: "embedMany", texts },
      { onEmbedProgress: onProgress }
    );
  }

  // lib/cache.ts
  var DB_NAME = "semantic-find";
  var DB_VERSION = 1;
  var STORE = "embeddings";
  function openDb() {
    return new Promise((resolve, reject) => {
      const req = indexedDB.open(DB_NAME, DB_VERSION);
      req.onupgradeneeded = () => {
        if (!req.result.objectStoreNames.contains(STORE)) {
          req.result.createObjectStore(STORE, { keyPath: "key" });
        }
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  }
  async function loadEmbeddings(key) {
    try {
      const db = await openDb();
      const record = await new Promise(
        (resolve, reject) => {
          const tx = db.transaction(STORE, "readonly");
          const req = tx.objectStore(STORE).get(key);
          req.onsuccess = () => resolve(req.result);
          req.onerror = () => reject(req.error);
        }
      );
      db.close();
      if (!record) return null;
      const flat = new Float32Array(record.data);
      const vectors = [];
      for (let i = 0; i < record.count; i++) {
        vectors.push(flat.slice(i * record.dims, (i + 1) * record.dims));
      }
      return vectors;
    } catch (err) {
      console.warn("[cache] load failed (continuing without cache):", err);
      return null;
    }
  }
  async function saveEmbeddings(key, vectors) {
    if (vectors.length === 0) return;
    try {
      const dims = vectors[0].length;
      const flat = new Float32Array(vectors.length * dims);
      vectors.forEach((v, i) => flat.set(v, i * dims));
      const record = {
        key,
        dims,
        count: vectors.length,
        data: flat.buffer,
        createdAt: Date.now()
      };
      const db = await openDb();
      await new Promise((resolve, reject) => {
        const tx = db.transaction(STORE, "readwrite");
        tx.objectStore(STORE).put(record);
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
      });
      db.close();
    } catch (err) {
      console.warn("[cache] save failed:", err);
    }
  }

  // extension/overlay.css
  var overlay_default = "/* ============================================================\n   extension/overlay.css\n   ============================================================\n   OVERLAY UI styles, scoped to the Shadow Root. content.ts imports\n   this file as text at build time (esbuild's `text` loader) and injects\n   it into the shadow root via a <style> tag \u2014 page CSS does NOT pierce\n   shadow DOM, and fetching it at runtime would require it to be a\n   web-accessible resource, so bundling is the robust path.\n\n   Page-level highlight rules live in highlight.css (loaded onto the host\n   document by the manifest's content_scripts.css).\n   ============================================================ */\n\n:host {\n  all: initial;\n}\n\n.sf-ext-overlay {\n  position: fixed;\n  top: 16px;\n  right: 16px;\n  z-index: 2147483647;\n  width: 380px;\n  max-height: 80vh;\n  display: none;\n  flex-direction: column;\n  font-family: -apple-system, BlinkMacSystemFont, \"Segoe UI\", Roboto, sans-serif;\n  font-size: 13px;\n  color: #1f2937;\n  background: #ffffff;\n  border: 1px solid #e5e7eb;\n  border-radius: 12px;\n  box-shadow: 0 12px 32px rgba(0, 0, 0, 0.18);\n  overflow: hidden;\n}\n\n.sf-ext-overlay.sf-ext-open {\n  display: flex;\n}\n\n/* Docked to the left edge instead of the right (\u21C4 toggle). */\n.sf-ext-overlay.sf-ext-left {\n  right: auto;\n  left: 16px;\n}\n\n.sf-ext-head {\n  display: flex;\n  align-items: center;\n  gap: 8px;\n  padding: 10px 12px;\n  border-bottom: 1px solid #f1f5f9;\n}\n\n.sf-ext-title {\n  font-weight: 600;\n  font-size: 13px;\n}\n\n.sf-ext-status {\n  flex: 1;\n  font-size: 11px;\n  color: #6b7280;\n  text-align: right;\n  overflow: hidden;\n  text-overflow: ellipsis;\n  white-space: nowrap;\n}\n\n.sf-ext-close,\n.sf-ext-dbg,\n.sf-ext-move {\n  border: none;\n  background: transparent;\n  cursor: pointer;\n  font-size: 14px;\n  color: #6b7280;\n  line-height: 1;\n  padding: 2px 4px;\n  border-radius: 6px;\n}\n\n.sf-ext-close:hover,\n.sf-ext-dbg:hover,\n.sf-ext-move:hover {\n  background: #f3f4f6;\n  color: #111827;\n}\n\n.sf-ext-dbg.sf-ext-dbg-on {\n  background: #fef3c7;\n  color: #92400e;\n}\n\n.sf-ext-debug {\n  margin: 6px 0 0;\n  padding: 6px 8px;\n  font-family: ui-monospace, SFMono-Regular, Menlo, monospace;\n  font-size: 10px;\n  line-height: 1.45;\n  white-space: pre-wrap;\n  word-break: break-word;\n  color: #475569;\n  background: #f8fafc;\n  border: 1px solid #e2e8f0;\n  border-radius: 6px;\n}\n\n.sf-ext-input {\n  margin: 10px 12px 6px;\n  padding: 8px 10px;\n  font-size: 13px;\n  color: #111827;\n  border: 1px solid #d1d5db;\n  border-radius: 8px;\n  outline: none;\n}\n\n.sf-ext-input:focus {\n  border-color: #2563eb;\n  box-shadow: 0 0 0 2px rgba(37, 99, 235, 0.15);\n}\n\n.sf-ext-meta {\n  padding: 0 12px 6px;\n  font-size: 11px;\n  color: #6b7280;\n  min-height: 14px;\n}\n\n.sf-ext-filters {\n  display: flex;\n  flex-wrap: wrap;\n  gap: 8px 12px;\n  padding: 6px 12px;\n  border-bottom: 1px solid #f1f5f9;\n}\n\n.sf-ext-filter {\n  display: inline-flex;\n  align-items: center;\n  gap: 4px;\n  font-size: 11px;\n  color: #374151;\n  cursor: pointer;\n}\n\n.sf-ext-dot {\n  width: 8px;\n  height: 8px;\n  border-radius: 50%;\n  display: inline-block;\n}\n\n.sf-ext-filter-count {\n  min-width: 16px;\n  padding: 0 5px;\n  font-size: 10px;\n  font-weight: 600;\n  line-height: 15px;\n  text-align: center;\n  color: #374151;\n  background: #f3f4f6;\n  border-radius: 999px;\n}\n\n.sf-ext-results {\n  list-style: none;\n  margin: 0;\n  padding: 6px;\n  overflow-y: auto;\n}\n\n.sf-ext-result {\n  padding: 8px;\n  border-radius: 8px;\n  cursor: pointer;\n  border: 1px solid transparent;\n}\n\n.sf-ext-result:hover {\n  background: #f9fafb;\n}\n\n.sf-ext-result.sf-ext-active {\n  background: #eff6ff;\n  border-color: #bfdbfe;\n}\n\n.sf-ext-tag {\n  display: inline-block;\n  font-size: 10px;\n  font-weight: 600;\n  padding: 1px 6px;\n  border-radius: 999px;\n  margin-bottom: 4px;\n}\n\n.sf-ext-result-head {\n  display: block;\n  font-weight: 600;\n  font-size: 12px;\n  color: #111827;\n  margin-bottom: 2px;\n}\n\n.sf-ext-snippet {\n  margin: 0;\n  font-size: 12px;\n  line-height: 1.4;\n  color: #4b5563;\n}\n\n.sf-ext-empty {\n  padding: 16px;\n  text-align: center;\n  color: #9ca3af;\n}\n\n/* Provenance colors \u2014 shared by filter dots and result tags. */\n.sf-tag-exact {\n  background: #dcfce7;\n  color: #166534;\n}\n.sf-ext-dot.sf-tag-exact {\n  background: #22c55e;\n}\n.sf-tag-close {\n  background: #dbeafe;\n  color: #1e40af;\n}\n.sf-ext-dot.sf-tag-close {\n  background: #3b82f6;\n}\n.sf-tag-related {\n  background: #fef3c7;\n  color: #92400e;\n}\n.sf-ext-dot.sf-tag-related {\n  background: #f59e0b;\n}\n.sf-tag-loose {\n  background: #f3f4f6;\n  color: #6b7280;\n}\n.sf-ext-dot.sf-tag-loose {\n  background: #9ca3af;\n}\n";

  // extension/content.ts
  var ROOT_ID = "semantic-find-extension-root";
  var SEARCH_DEBOUNCE_MS = 120;
  var SEMANTIC_DEBOUNCE_MS = 200;
  var page = null;
  var extraction = null;
  var modelState = "idle";
  var host = null;
  var shadow = null;
  var els = null;
  var isOpen = false;
  var activeIdx = 0;
  var lastResults = [];
  var lastQuery = "";
  var visibleTags = {
    exact: true,
    close: true,
    related: true,
    loose: true
  };
  var searchTimer;
  var semanticTimer;
  var searchSeq = 0;
  var debugOn = false;
  var lastLiteralCount = 0;
  var side = "right";
  var filterCountEls = {};
  async function ensureOverlay() {
    if (host) return;
    host = document.createElement("div");
    host.id = ROOT_ID;
    shadow = host.attachShadow({ mode: "open" });
    document.documentElement.appendChild(host);
    const swallow = (e) => e.stopPropagation();
    for (const type of ["keydown", "keypress", "keyup", "beforeinput", "input"]) {
      host.addEventListener(type, swallow);
    }
    const style = document.createElement("style");
    style.textContent = overlay_default;
    shadow.appendChild(style);
    const panel = h("div", "sf-ext-overlay");
    panel.setAttribute("role", "dialog");
    panel.setAttribute("aria-label", "Semantic Find");
    const header = h("div", "sf-ext-head");
    const title = h("span", "sf-ext-title", "Semantic Find");
    const status = h("span", "sf-ext-status");
    const move = h("button", "sf-ext-move", "\u21C4");
    move.setAttribute("aria-label", "Move to other side");
    move.title = "Move the panel to the other side (Alt+Shift+\u2190 / Alt+Shift+\u2192)";
    move.addEventListener("click", () => toggleSide());
    const dbg = h("button", "sf-ext-dbg", "\u{1F41E}");
    dbg.setAttribute("aria-label", "Toggle debug info");
    dbg.title = "Toggle debug info (chunk/anchor/block mapping)";
    dbg.addEventListener("click", () => {
      debugOn = !debugOn;
      dbg.classList.toggle("sf-ext-dbg-on", debugOn);
      renderResults(lastResults);
    });
    const close = h("button", "sf-ext-close", "\u2715");
    close.setAttribute("aria-label", "Close");
    close.addEventListener("click", () => closeOverlay());
    header.append(title, status, move, dbg, close);
    const input = document.createElement("input");
    input.className = "sf-ext-input";
    input.type = "text";
    input.placeholder = "Find on page \u2014 words, fragments, typos, or meaning";
    input.setAttribute("aria-label", "Search query");
    input.addEventListener("input", onInput);
    input.addEventListener("keydown", onInputKeyDown);
    const meta = h("div", "sf-ext-meta");
    const list = h("ul", "sf-ext-results");
    const filters = h("div", "sf-ext-filters");
    panel.append(header, input, meta, filters, list);
    shadow.append(panel);
    els = { panel, input, status, meta, list, filters };
    buildFilters();
    applySide();
  }
  function applySide() {
    els?.panel.classList.toggle("sf-ext-left", side === "left");
  }
  function setSide(next) {
    side = next;
    applySide();
  }
  function toggleSide() {
    setSide(side === "right" ? "left" : "right");
  }
  function h(tag, className, text) {
    const el = document.createElement(tag);
    el.className = className;
    if (text !== void 0) el.textContent = text;
    return el;
  }
  function buildFilters() {
    if (!els) return;
    els.filters.replaceChildren();
    for (const tag of PROVENANCE_ORDER) {
      const label = h("label", "sf-ext-filter");
      const box = document.createElement("input");
      box.type = "checkbox";
      box.checked = visibleTags[tag];
      box.addEventListener("change", () => {
        visibleTags[tag] = box.checked;
        renderResults(lastResults);
      });
      const dot = h("span", `sf-ext-dot ${PROVENANCE_META[tag].className}`);
      const count = h("span", "sf-ext-filter-count", "0");
      filterCountEls[tag] = count;
      label.append(
        box,
        dot,
        document.createTextNode(PROVENANCE_META[tag].label),
        count
      );
      els.filters.append(label);
    }
  }
  function updateFilterCounts(results) {
    const counts = {
      exact: 0,
      close: 0,
      related: 0,
      loose: 0
    };
    for (const r of results) counts[r.provenance]++;
    for (const tag of PROVENANCE_ORDER) {
      const el = filterCountEls[tag];
      if (el) el.textContent = String(counts[tag]);
    }
  }
  async function openOverlay() {
    await ensureOverlay();
    if (!els) return;
    isOpen = true;
    els.panel.classList.add("sf-ext-open");
    els.input.focus();
    els.input.select();
    if (!page) await indexPage();
    if (els.input.value.trim()) scheduleSearch();
  }
  function closeOverlay() {
    isOpen = false;
    clearHighlights();
    clearLiveFind();
    if (els) els.panel.classList.remove("sf-ext-open");
  }
  function activateOverlay() {
    if (isOpen) {
      els?.input.focus();
      els?.input.select();
    } else {
      void openOverlay();
    }
  }
  async function indexPage() {
    setStatus("Reading page\u2026");
    extraction = extractBlocks(document);
    page = new PageIndex(extraction.blocks);
    if (page.chunkCount === 0) {
      setStatus("No readable text found on this page.");
      return;
    }
    setStatus(`${page.chunkCount} sections indexed`);
    void warmSemantic();
  }
  async function warmSemantic() {
    if (!page || modelState === "loading" || modelState === "ready") return;
    modelState = "loading";
    const cacheKey = `${MODEL_ID}::${location.origin}${location.pathname}::${page.textHash}`;
    try {
      const cached = await loadEmbeddings(cacheKey);
      if (cached && cached.length === page.chunkCount) {
        page.setVectors(cached);
        modelState = "ready";
        setStatus(`${page.chunkCount} sections \xB7 semantic ready (cached)`);
        void loadModel().catch(() => {
        });
        if (isOpen && lastQuery) scheduleSearch();
        return;
      }
      setStatus("Loading semantic model\u2026");
      await loadModel((p) => {
        if (typeof p.progress === "number") {
          setStatus(`Loading model\u2026 ${Math.round(p.progress)}%`);
        }
      });
      setStatus("Indexing page for meaning\u2026");
      const vectors = await embedChunks(
        page.chunks.map((c) => c.text),
        (done, total) => setStatus(`Indexing\u2026 ${done}/${total}`)
      );
      page.setVectors(vectors);
      void saveEmbeddings(cacheKey, vectors);
      modelState = "ready";
      setStatus(`${page.chunkCount} sections \xB7 semantic ready`);
      if (isOpen && lastQuery) scheduleSearch();
    } catch (err) {
      modelState = "failed";
      console.warn(
        "[semantic-find] semantic model unavailable:",
        describeError(err),
        err
      );
      setStatus("Semantic model failed \u2014 literal & keyword search only");
    }
  }
  function onInput() {
    scheduleSearch();
  }
  function scheduleSearch() {
    window.clearTimeout(searchTimer);
    window.clearTimeout(semanticTimer);
    searchTimer = window.setTimeout(runSearch, SEARCH_DEBOUNCE_MS);
  }
  async function runSearch() {
    if (!page || !els) return;
    const query = els.input.value;
    lastQuery = query;
    const seq = ++searchSeq;
    lastLiteralCount = runLiveFind(query.trim());
    if (lastLiteralCount > 0) setCurrentMatch(0);
    const fast = page.search(query, null);
    if (seq === searchSeq) {
      lastResults = fast.results;
      activeIdx = 0;
      renderMeta(fast);
      renderResults(fast.results);
    }
    if (modelState === "ready" && page.hasVectors && query.trim()) {
      window.clearTimeout(semanticTimer);
      semanticTimer = window.setTimeout(async () => {
        try {
          const qVec = await embedText(query.trim());
          if (seq !== searchSeq) return;
          const full = page.search(query, qVec);
          lastResults = full.results;
          renderMeta(full);
          renderResults(full.results);
        } catch (err) {
          console.warn("[semantic-find] query embed failed:", describeError(err), err);
        }
      }, SEMANTIC_DEBOUNCE_MS);
    }
  }
  function visibleResults() {
    return lastResults.filter((r) => visibleTags[r.provenance]);
  }
  function renderMeta(out) {
    if (!els) return;
    const q = els.input.value.trim();
    if (!q) {
      els.meta.textContent = "";
      return;
    }
    const parts = [];
    if (lastLiteralCount > 0) {
      const pos = currentMatchIndex() >= 0 ? `${currentMatchIndex() + 1}/` : "";
      parts.push(
        `${pos}${lastLiteralCount} exact match${lastLiteralCount === 1 ? "" : "es"} on page`
      );
    } else {
      parts.push("no exact matches on page");
    }
    parts.push(`${out.results.length} result${out.results.length === 1 ? "" : "s"}`);
    els.meta.textContent = parts.join(" \xB7 ");
  }
  function refreshMeta() {
    renderMeta({
      totalOccurrences: 0,
      literalChunkCount: 0,
      results: lastResults
    });
  }
  function renderResults(results) {
    if (!els || !page) return;
    updateFilterCounts(results);
    els.list.replaceChildren();
    const shown = results.filter((r) => visibleTags[r.provenance]);
    if (els.input.value.trim() && shown.length === 0) {
      els.list.append(h("li", "sf-ext-empty", "No results."));
      return;
    }
    shown.forEach((r, i) => {
      const chunk = page.chunks[r.index];
      const li = h("li", "sf-ext-result");
      if (i === activeIdx) li.classList.add("sf-ext-active");
      li.dataset.idx = String(i);
      const tag = h(
        "span",
        `sf-ext-tag ${PROVENANCE_META[r.provenance].className}`,
        PROVENANCE_META[r.provenance].label
      );
      const head = h("span", "sf-ext-result-head", chunk.heading || "(section)");
      const snippet = h("p", "sf-ext-snippet", snippetFor(chunk.text, els.input.value));
      li.append(tag, head, snippet);
      if (debugOn) li.append(buildDebug(r, chunk));
      li.addEventListener("click", () => {
        activeIdx = i;
        jumpTo(i);
        markActive();
      });
      els.list.append(li);
    });
  }
  function buildDebug(r, chunk) {
    const target = resolveChunkTarget(chunk, els?.input.value ?? "");
    const elPreview = target.el ? `\xAB${(target.el.textContent ?? "").replace(/\s+/g, " ").trim().slice(0, 80)}\xBB` : "(element not found)";
    const lines = [
      `chunk id   : ${r.index}`,
      `anchor id  : ${chunk.anchorId}`,
      `target id  : ${target.blockId}${target.matched ? " (query match)" : " (anchor fallback)"}`,
      `block ids  : ${chunk.blockIds.join(", ")}`,
      `cosine/rrf : ${r.cosine.toFixed(3)} / ${r.score.toFixed(4)}`,
      `element    : ${elPreview}`,
      `snippet    : ${snippetFor(chunk.text, els?.input.value ?? "").slice(0, 80)}`
    ];
    return h("pre", "sf-ext-debug", lines.join("\n"));
  }
  function snippetFor(text, query) {
    const q = query.trim().toLowerCase();
    const flat = text.replace(/\s+/g, " ").trim();
    if (q) {
      const at = flat.toLowerCase().indexOf(q);
      if (at > 40) {
        const start = Math.max(0, at - 40);
        return "\u2026" + flat.slice(start, start + 180);
      }
    }
    return flat.slice(0, 180) + (flat.length > 180 ? "\u2026" : "");
  }
  function markActive() {
    if (!els) return;
    const items = els.list.querySelectorAll(".sf-ext-result");
    items.forEach(
      (el, i) => el.classList.toggle("sf-ext-active", i === activeIdx)
    );
    const active = items[activeIdx];
    active?.scrollIntoView({ block: "nearest" });
  }
  function setStatus(text) {
    if (els) els.status.textContent = text;
  }
  function describeError(err) {
    if (err instanceof Error || err instanceof DOMException) {
      return `${err.name}: ${err.message}`;
    }
    if (err && typeof err === "object") {
      const e = err;
      if (e.name || e.message) return `${e.name ?? "Error"}: ${e.message ?? ""}`;
    }
    return String(err);
  }
  function resolveChunkTarget(chunk, needle) {
    const n = needle.trim().toLowerCase();
    if (n && extraction) {
      for (const id of chunk.blockIds) {
        const el2 = extraction.elementById.get(id);
        if (el2 && (el2.textContent ?? "").toLowerCase().includes(n)) {
          return { el: el2, blockId: id, matched: true };
        }
      }
    }
    const el = extraction?.elementById.get(chunk.anchorId) ?? null;
    return { el, blockId: chunk.anchorId, matched: false };
  }
  function jumpTo(visibleIdx) {
    if (!page || !extraction) return;
    const r = visibleResults()[visibleIdx];
    if (!r) return;
    const chunk = page.chunks[r.index];
    const needle = els?.input.value ?? "";
    const target = resolveChunkTarget(chunk, needle);
    console.debug("[semantic-find] jump", {
      chunkId: r.index,
      anchorId: chunk.anchorId,
      targetBlockId: target.blockId,
      matchedBlock: target.matched,
      blockIds: chunk.blockIds,
      provenance: r.provenance,
      cosine: Number(r.cosine.toFixed(3)),
      elementText: target.el ? (target.el.textContent ?? "").replace(/\s+/g, " ").trim().slice(0, 120) : null,
      snippet: snippetFor(chunk.text, needle)
    });
    if (target.el) highlightElement(target.el);
  }
  function onInputKeyDown(e) {
    const shown = visibleResults();
    if (e.key === "Escape") {
      e.preventDefault();
      closeOverlay();
    } else if (e.key === "ArrowDown") {
      e.preventDefault();
      activeIdx = Math.min(activeIdx + 1, Math.max(0, shown.length - 1));
      markActive();
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      activeIdx = Math.max(activeIdx - 1, 0);
      markActive();
    } else if (e.key === "Enter") {
      e.preventDefault();
      if (lastLiteralCount > 0) {
        if (e.shiftKey) prevMatch();
        else nextMatch();
        refreshMeta();
      } else if (shown.length) {
        jumpTo(activeIdx);
      }
    }
  }
  window.addEventListener(
    "keydown",
    (e) => {
      if (e.altKey && e.shiftKey && e.key.toLowerCase() === "k") {
        e.preventDefault();
        activateOverlay();
      } else if (e.altKey && e.shiftKey && e.key === "ArrowLeft") {
        e.preventDefault();
        setSide("left");
      } else if (e.altKey && e.shiftKey && e.key === "ArrowRight") {
        e.preventDefault();
        setSide("right");
      } else if (isOpen && (e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        els?.input.focus();
        els?.input.select();
      }
    },
    true
  );
  chrome.runtime.onMessage.addListener((message) => {
    if (message?.type === "TOGGLE_SEMANTIC_FIND") activateOverlay();
  });
})();
//# sourceMappingURL=content.js.map
