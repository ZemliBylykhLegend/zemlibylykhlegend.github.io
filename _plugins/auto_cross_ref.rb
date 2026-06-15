# frozen_string_literal: true
require 'cgi'
require 'set'

module AutoCrossRef
  # 🔹 Чтение конфигурации из _config.yml
  def self.config(site)
    return {} unless site&.config
    site.config['auto_cross_ref'] || {}
  end

  # 🔹 Получение списка каталогов для индексации (без лидирующих слешей)
  def self.target_dirs(site)
    cfg = config(site)
    base = cfg.fetch('base_dir', 'docs').to_s.strip.gsub(%r{^/+|/+$}, '')
    base = 'docs' if base.empty?

    subdirs = cfg['subdirs'] || []
    return [base] if subdirs.empty?

    subdirs.map { |d| "#{base}/#{d.to_s.strip}".gsub(%r{/+}, '/') }
  end

  # 🔹 Получение списка исключений
  def self.excluded_words(site)
    cfg = config(site)
    words = cfg['excluded_words'] || []
    Set.new(words.map(&:downcase))
  end

  # 🔹 Морфологический анализ русского языка
  module RussianMorph
    ALL = %w[
      ами ями ыми ими ому ему ого его ою ею
      ых их ые ие ам ям ах ях
      ов ев ей ом ем ой ым им ая яя
      ое ее ую юю ый ий ам ям ах ях
      ов ев ей ом ем ой ым им ец цы
      ых их ье ью а я о е и ы у ю ь
    ].freeze
    MAX_LEN = ALL.map(&:length).max

    def self.stem_for(word)
      return word if word.length <= 3
      if word.include?('-')
        parts = word.split('-', 2)
        # Только вторая часть склоняется
        "#{parts[0]}-#{trim_endings(parts[1])}"
      else
        trim_endings(word)
      end
    end

    def self.trim_endings(word)
      w_down = word.downcase
      ALL.each do |ending|
        if w_down.end_with?(ending)
          candidate = word[0...-ending.length]
          return candidate if candidate.length >= 2
        end
      end
      word
    end

    def self.word_pattern(word)
      if word.include?('-')
        parts = word.split('-', 2)
        stem2 = trim_endings(parts[1])
        # Буквальный дефис, первая часть точная, вторая + опциональное окончание
        "#{Regexp.escape(parts[0])}-#{Regexp.escape(stem2)}[а-яёА-ЯЁ]{0,#{MAX_LEN}}"
      else
        stem = stem_for(word)
        "#{Regexp.escape(stem)}[а-яёА-ЯЁ]{0,#{MAX_LEN}}"
      end
    end

    def self.term_pattern(term)
      term.split.map { |w| word_pattern(w) }.join('\s+')
    end

    def self.canonical_stem(term)
      term.split.map { |w| stem_for(w.downcase) }.join(' ')
    end
  end

  # 🔹 ШАГ 1: Сбор заголовков (хук :site, :post_read)
  Jekyll::Hooks.register :site, :post_read do |site|
    cfg = config(site)
    next unless cfg['enabled'] != false

    target_dirs = target_dirs(site)
    excluded = excluded_words(site)

    Jekyll.logger.info "AutoCrossRef:", "Indexing headers in #{target_dirs.join(', ')}..."
    site.data['_cross_refs'] = {}

    files_scanned = 0
    headers_found = 0

    (site.pages + site.documents).each do |page|
      next unless page.respond_to?(:path) && page.path
      next unless target_dirs.any? { |dir| page.path.start_with?("#{dir}/") }
      next unless page.path.end_with?('.md')
      next unless page.respond_to?(:content) && page.content

      files_scanned += 1

      # Безопасный парсинг H1/H2 без интерполяции Ruby
      page.content.scan(/^\#{1,2}\s+(.+)$/).each do |match|
        title = match[0].strip
        next if title.empty?

        slug = title.downcase.gsub(/[^\p{Alnum}\s-]/, '').gsub(/\s+/, '-')
        slug = CGI.escape(slug) if slug.match?(/[^a-zA-Z0-9_-]/)

        site.data['_cross_refs'][title.downcase] = {
          url: page.url,
          slug: slug,
          original: title,
          file: page.path,
          stem: RussianMorph.canonical_stem(title)
        }
        headers_found += 1
      end
    end
    Jekyll.logger.info "AutoCrossRef:", "Scanned #{files_scanned} files, indexed #{headers_found} headers."
  end

  # 🔹 ШАГ 2: Внедрение ссылок (хук :pages, :pre_render)
  Jekyll::Hooks.register :pages, :pre_render do |page, payload|
    site = page.site
    cfg = config(site)
    next unless cfg['enabled'] != false

    target_dirs = target_dirs(site)
    excluded = excluded_words(site)

    next unless target_dirs.any? { |dir| page.path.start_with?("#{dir}/") }
    next unless page.path.end_with?('.md')

    refs = site.data['_cross_refs']
    next if refs.nil? || refs.empty?

    content = page.content || ''
    placeholders = {}
    idx = 0

    # 1. Изоляция заголовков
    content = content.gsub(/^\#{1,2}\s+[^\n]+/) do |m|
      k = "%%HDR_#{idx += 1}%%"
      placeholders[k] = m
      k
    end

    # 2. Изоляция кода, ссылок, изображений
    content = content.gsub(/(```[\s\S]*?```|`[^`]+`|!$$[^$$]*\]$[^)]+$|$$[^$$]+\]$[^)]+$)/) do |m|
      k = "%%BLOCK_#{idx += 1}%%"
      placeholders[k] = m
      k
    end

    # 3. Сортировка: ДЛИННЫЕ ПЕРВЫМИ для regex (матчинг greedy)
    sorted_for_regex = refs.values.sort_by { |r| -r[:original].length }
    terms_regex = sorted_for_regex.map { |r| RussianMorph.term_pattern(r[:original]) }.join('|')

    # 4. Однопроходовая замена (+ дефис в lookaround для дефисных слов)
    full_pattern = %r{(?<![-а-яёa-zA-Z0-9_$$])(#{terms_regex})(?![-а-яёa-zA-Z0-9_$$])}i

    content = content.gsub(full_pattern) do |match|
      next match if excluded.include?(match.downcase)

      match_stem = RussianMorph.canonical_stem(match)

      # 🔹 FIX: При конфликте стемов выбираем КОРОТКИЙ оригинал (Req 4)
      candidates = refs.values.select { |r| r[:stem] == match_stem }
      ref = candidates.min_by { |r| r[:original].length }

      next match if ref.nil?

      link_url = ref[:url].sub(/\/$/, '')
      link = (page.path == ref[:file]) ? "##{ref[:slug]}" : "#{link_url}##{ref[:slug]}"
      "[#{match}](#{link})"
    end

    # 5. Восстановление изолированных блоков
    placeholders.each { |k, v| content = content.gsub(k, v) }
    page.content = content
  end
end
