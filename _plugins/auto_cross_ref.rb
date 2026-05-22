# _plugins/auto_cross_ref.rb
require 'cgi'
require 'set'

module AutoCrossRef
  # 🔹 Чтение конфигурации из _config.yml
  def self.config(site)
    return {} unless site&.config
    site.config['auto_cross_ref'] || {}
  end

  # 🔹 Получение списка каталогов для индексации
  def self.target_dirs(site)
    cfg = config(site)
    base = cfg['base_dir'].to_s.strip.gsub(%r{^/+|/+$}, '')
    base = 'docs' if base.empty?

    subdirs = cfg['subdirs'] || []
    return [base] if subdirs.empty?

    subdirs.map do |dir|
      dir = dir.to_s.strip
      "#{base}/#{dir}".gsub(%r{/+}, '/')
    end
  end

  # 🔹 Получение списка исключений
  def self.excluded_words(site)
    cfg = config(site)
    words = cfg['excluded_words'] || []
    Set.new(words.map(&:downcase))
  end

  # 🔹 Морфологический анализ
  module RussianMorph
    ALL = %w[ами  ями  ыми  ими
      ому  ему  ого  его  ою  ею  ыми  ими  ых  их  ые  ие  ам
      ям  ах  ях  ов  ев  ей  ом  ем  ой  ей  ым  им  ая  яя
      ое  ее  ую  юю  ый  ий  ой
      ам  ям  ах  ях  ов  ев  ей  ом  ем  ой  ей  ым  им ец цы
      ая  яя  ое  ее  ую  юю  ый  ий  ой  ые  ие  ых  их  ью  ами  ями
      а  я  о  е  и  ы  у  ю  ь].freeze
    MAX_LEN = ALL.map(&:length).max

    def self.stem_for(word)
      return word if word.length <= 3
      if word.include?('-')
        parts = word.split('-')
        stemmed_parts = parts.map { |p| trim_endings(p) }
        return stemmed_parts.join('-')
      end
      trim_endings(word)
    end

    def self.trim_endings(word)
      ALL.each do |ending|
        if word.downcase.end_with?(ending)
          candidate = word[0..-ending.length-1]
          return candidate if candidate && candidate.length >= 3
        end
      end
      word
    end

    def self.word_pattern(word)
      stem = stem_for(word)
      suffix = "[а-яёА-ЯЁ]{0,#{MAX_LEN}}"
      "#{Regexp.escape(stem)}#{suffix}"
    end

    def self.term_pattern(term)
      term.split.map { |w| word_pattern(w) }.join('\s+')
    end

    def self.canonical_stem(term)
      term.split.map { |w| stem_for(w.downcase) }.join(' ')
    end
  end

  # 🔹 ШАГ 1: Сбор заголовков
  Jekyll::Hooks.register :site, :post_read do |site|
    cfg = AutoCrossRef.config(site)
    next unless cfg['enabled'] != false

    target_dirs = AutoCrossRef.target_dirs(site)
    excluded = AutoCrossRef.excluded_words(site)

    Jekyll.logger.info "AutoCrossRef:", "Indexing headers in #{target_dirs.join(', ')}..."
    site.data['_cross_refs'] = {}

    files_scanned = 0
    headers_found = 0

    (site.pages + site.documents).each do |page|
      in_target = target_dirs.any? { |dir| page.path.start_with?("#{dir}/") }
      next unless in_target
      next unless page.path.end_with?('.md')
      next unless page.respond_to?(:content) && page.content

      files_scanned += 1

      page.content.scan(%r{^(\#{1,2})\s+(.+)$}).each do |_level, title|
        title = title.strip
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

  # 🔹 ШАГ 2: Внедрение ссылок
  Jekyll::Hooks.register :pages, :pre_render do |page, payload|
    # 🔹 ИСПРАВЛЕНО: используем page.site вместо payload['site']
    site = page.site
    cfg = AutoCrossRef.config(site)
    next unless cfg['enabled'] != false

    target_dirs = AutoCrossRef.target_dirs(site)
    excluded = AutoCrossRef.excluded_words(site)

    in_target = target_dirs.any? { |dir| page.path.start_with?("#{dir}/") }
    next unless in_target
    next unless page.path.end_with?('.md')

    refs = site.data['_cross_refs']
    next if refs.nil? || refs.empty?

    content = page.content || ""
    placeholders = {}
    idx = 0

    # 1. Изолируем заголовки
    content = content.gsub(%r{^(\#{1,2}\s[^\n]+)}) do |m|
      k = "%%HDR_#{idx += 1}%%"
      placeholders[k] = m
      k
    end

    # 2. Изолируем код и ссылки
    content = content.gsub(/(```[\s\S]*?```|`[^`]+`|\[.*?\]\(.*?\)|!\[.*?\]\(.*?\))/) do |m|
      k = "%%BLOCK_#{idx += 1}%%"
      placeholders[k] = m
      k
    end

    # 3. Сортируем по длине
    sorted_refs = refs.values.sort_by { |r| -r[:original].length }
    terms_regex = sorted_refs.map { |r| RussianMorph.term_pattern(r[:original]) }.join('|')
    full_pattern = %r{(?<![а-яёa-zA-Z0-9_\[])(#{terms_regex})(?![а-яёa-zA-Z0-9_\]])}i

    # 4. Однопроходовая замена
    content = content.gsub(full_pattern) do |match|
      match_stem = RussianMorph.canonical_stem(match)
      ref = sorted_refs.find { |r| r[:stem] == match_stem }

      next match if ref.nil? || excluded.include?(match.downcase)

      link = (page.path == ref[:file]) ? "##{ref[:slug]}" : "#{ref[:url]}##{ref[:slug]}"
      "[#{match}](#{link})"
    end

    # 5. Восстанавливаем блоки
    placeholders.each { |k, v| content = content.gsub(k, v) }
    page.content = content
  end
end