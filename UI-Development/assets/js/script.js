/* Chart.js setup with placeholder data themed to match the UI */
const primary = '#ff5bbb';
const teal = '#27e0a7';
const purple = '#6a74ff';
const grid = 'rgba(255,255,255,0.06)';
const text = '#cbd5e1';

function createLine(ctx, dataPoints, color){
  return new Chart(ctx,{
    type:'line',
    data:{
      labels:['JAN','FEB','MAR','APR','MAY','JUN','JUL','AUG','SEP','OCT','NOV','DEC'],
      datasets:[{
        data:dataPoints,
        borderColor:color,
        backgroundColor:'transparent',
        pointBackgroundColor:color,
        pointBorderColor:color,
        pointRadius:4,
        tension:.35,
        borderWidth:2
      }]
    },
    options:{
      responsive:true,
      maintainAspectRatio:false,
      plugins:{
        legend:{display:false},
        tooltip:{enabled:true,mode:'index',intersect:false}
      },
      scales:{
        x:{
          ticks:{color:text},
          grid:{color:grid}
        },
        y:{
          ticks:{color:text},
          grid:{color:grid}
        }
      }
    }
  });
}

function createBars(ctx){
  return new Chart(ctx,{
    type:'bar',
    data:{
      labels:['USA','GER','AUS','UK','RO','BR'],
      datasets:[{
        data:[45,15,12,72,96,43],
        backgroundColor:[purple,grid,grid,purple,purple,grid],
        borderWidth:0,
        borderRadius:6
      }]
    },
    options:{
      responsive:true,
      maintainAspectRatio:false,
      plugins:{legend:{display:false}},
      scales:{
        x:{ticks:{color:text},grid:{display:false}},
        y:{ticks:{color:text},grid:{color:grid}}
      }
    }
  });
}

document.addEventListener('DOMContentLoaded',()=>{
  const perf = document.getElementById('chartPerformance');
  const mini1 = document.getElementById('chartMini1');
  const mini2 = document.getElementById('chartMini2');
  const bars = document.getElementById('chartBars');

  if(perf){
    createLine(perf.getContext('2d'),[98,72,88,70,82,60,74,66,80,92,110,102],primary);
  }
  if(mini1){
    createLine(mini1.getContext('2d'),[78,92,70,68,72,90,118,126,132,128,140,96],primary);
  }
  if(mini2){
    createLine(mini2.getContext('2d'),[104,66,72,58,62,70,60,56,48,52,74,100],teal);
  }
  if(bars){
    createBars(bars.getContext('2d'));
  }
});


