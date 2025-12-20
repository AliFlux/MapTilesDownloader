<script>
    import { fade, slide, scale, draw } from 'svelte/transition';

    export let expandable = false;
    let expanded = false;

    function titleClick() {
        if(expandable) {
            expanded = !expanded;
        }
    }

</script>

<div class={"section " + (expandable ? "section-expandable " : " ") + (expanded ? "section-expanded " : " ") }>
    <div class="section-number" on:click={titleClick}>
        <slot name="number"></slot>
    </div>
    <div class="section-title" on:click={titleClick}>
        <slot name="title"></slot>

        {#if (expandable)}
            {#if (expanded)}
                <span class="expand-icon">-</span>
            {:else}
                <span class="expand-icon">+</span>
            {/if}
        {/if}
    </div>

    {#if (!expandable || expandable && expanded)}
    <div class="section-content" transition:slide>
        <slot></slot>
    </div>
    {/if}
</div>

<style type="text/scss">

    .section {
		position: relative;
		margin-bottom: 1em;

		.section-number {
			font-weight: 600;
			position: absolute;
			left: -21px;
			width: 30px;
			border-radius: 100%;
			text-align: center;
			padding: 9px 5px;
			background: #16a085;
			color: white;
            border: 2px solid white;
            z-index: 9;
		}

		.section-title {
			font-size: 22px;
			margin-left: 30px;
			padding-top: 5px;
            position: relative;
		}

		.section-content {
			margin-top: 1em;
			margin-left: 30px;
			margin-right: 30px;
		}
		
	}

    .section-expandable {

		.section-number {
			color: #16a085;
			background: white;
            border: 2px solid #16a085;
            cursor: pointer;
        }
        
		.section-title {
            cursor: pointer;
        }

        .expand-icon {
            position: absolute;
            right: 30px;
            opacity: 0.6;
            top: 12px;
            font-family: 'Courier New', Courier, monospace;
        }

        // .section-content {
        //     display: none;
        // }
    }

    // .section-expandable.section-expanded {
    //     .section-content {
    //         display: block;
    //     }
    // }

</style>