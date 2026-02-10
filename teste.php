<?php
// 1. Recupera as configurações salvas (JSON)
$rawTitleConfig = $negocio->config->get('coverBannerTitleConfig');
$rawSubTitleConfig = $negocio->config->get('coverBannerSubTitleConfig');

// 2. Helper para separar Classes de Estilos
$parseConfig = function ($jsonConfig) {
    $config = is_string($jsonConfig) ? json_decode($jsonConfig, true) : $jsonConfig;
    $styles = []; // Array para montar o CSS depois
    $classes = ''; // String para por na tag class=""

    if (is_array($config)) {
        foreach ($config as $item) {
            // Se for Style, guarda no array key => value
            if (isset($item['type']) && $item['type'] === 'Style' && !empty($item['key'])) {
                $styles[] = $item['key'] . ': ' . $item['value'] . ';';
            }
            // Se for Class, concatena na string
            elseif (isset($item['type']) && $item['type'] === 'Class') {
                $classes .= $item['value'] . ' ';
            }
        }
    }

    // Retorna string pronta para CSS e string pronta para Class
    return [
        'css_rules' => implode("\n        ", $styles),
        'classes' => trim($classes)
    ];
};

// 3. Processa H1 e H2
$h1Data = $parseConfig($rawTitleConfig);
$h2Data = $parseConfig($rawSubTitleConfig);

// Recupera a imagem do banner
$banner = $negocio->imagens->capa_banner;
?>

@if($banner)
<section class="new-banner-cover" id="section-{{ $section_index ?? 'cover' }}">
    <div class="block-boundary" data-name="cover" data-type="new-banner">
        <div class="mbr-section mbr-section__container mbr-after-navbar even" id="banner-{{ $section_index ?? 'cover' }}">
            <div class="container">
                <div class="row new-banner-row">

                    {{-- COLUNA DE TEXTO --}}
                    <div class="col-md-6 col-xs-12 text-col">
                        <div class="text-block">
                            {{-- Título H1 com classes dinâmicas --}}
                            <h1 class="mbr-section-title mbr-bold pb-3 {{ $h1Data['classes'] }}">
                                {!! $negocio->config->get('coverBannerTitle') !!}
                            </h1>

                            {{-- Subtítulo H2 com classes dinâmicas --}}
                            <h2 class="mbr-section-text lead {{ $h2Data['classes'] }}">
                                {!! $negocio->config->get('coverBannerSubTitle') !!}
                            </h2>

                            <div class="mbr-section-btn">
                                <a class="btn btn-primary col-md-6 mt-4" href="#">
                                    Saiba Mais
                                </a>
                            </div>
                        </div>
                    </div>

                    {{-- COLUNA DE IMAGEM --}}
                    <div class="col-md-6 col-xs-12 img-col">
                        <figure class="mbr-figure">
                            <div class="img-wrapper">
                                {!! $banner->img('', [
                                    'class' => 'img-responsive',
                                    'title' => 'Banner do site',
                                    'alt' => $banner->getCustomProperty('description'),
                                ]) !!}
                            </div>
                        </figure>
                    </div>

                </div>
            </div>
        </div>
    </div>
</section>

<style>
    /* Estilos Gerais da Seção */
    section#section-<?= $section_index ?? 'cover' ?> {
        padding-top: 6.5rem;
        padding-bottom: 0px;
        background-color: #ffffff; /* Ou cor dinâmica se houver */
    }

    section#section-<?= $section_index ?? 'cover' ?> .new-banner-row {
        display: flex;
        flex-wrap: wrap;
        align-items: center;
    }

    /* Estilos Dinâmicos do H1 (Vindos do JSON) */
    section#section-<?= $section_index ?? 'cover' ?> h1 {
        /* Padrões caso não haja config */
        margin-bottom: 1rem;

        /* Injeção das regras CSS do JSON (Type=Style) */
        <?= $h1Data['css_rules'] ?>
    }

    /* Estilos Dinâmicos do H2 (Vindos do JSON) */
    section#section-<?= $section_index ?? 'cover' ?> h2 {
        /* Padrões caso não haja config */
        margin-bottom: 1rem;

        /* Injeção das regras CSS do JSON (Type=Style) */
        <?= $h2Data['css_rules'] ?>
    }

    /* Estilos fixos da Imagem (layout) */
    section#section-<?= $section_index ?? 'cover' ?> .img-wrapper {
        border-radius: 20px;
        overflow: hidden;
        box-shadow: 0 10px 30px rgba(0,0,0,0.1);
        aspect-ratio: 1;
        display: flex;
        align-items: center;
        justify-content: center;
    }

    section#section-<?= $section_index ?? 'cover' ?> .img-wrapper img {
        width: 80%;
        height: 80%;
        object-fit: cover;
        display: block;
        border-radius: 20px;
    }

    @media (max-width: 768px) {
        section#section-<?= $section_index ?? 'cover' ?> .text-col {
            text-align: center;
            margin-bottom: 2rem;
        }
        section#section-<?= $section_index ?? 'cover' ?> .img-col {
            margin-top: 1rem;
        }
    }
</style>
@endif