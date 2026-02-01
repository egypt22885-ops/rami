async function checkPayment(){
  const status = document.getElementById("status");
  status.innerText = "جاري التحقق من الدفع...";

  try{
    const res = await fetch("http://localhost:3000/verify");
    const data = await res.json();

    if(data.success){
      status.innerText = "تم الدفع ✔️ جاري التحميل...";
      window.location.href = data.download;
    }else{
      status.innerText = data.message;
    }
  }catch{
    status.innerText = "خطأ في الاتصال بالسيرفر";
  }
}
